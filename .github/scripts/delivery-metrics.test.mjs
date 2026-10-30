// Run with: node --test .github/scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRun, computeMetrics, sprintRanges } from './delivery-metrics.mjs';

const backend = (conclusion, startStep, completed_at = '2026-10-28T18:00:00Z') => ({
  name: 'Deploy backend to Render',
  conclusion,
  completed_at,
  steps: [{ name: 'Start Render deploy', conclusion: startStep }],
});
const frontend = (conclusion, publishStep, completed_at = '2026-10-28T18:00:00Z') => ({
  name: 'Deploy frontend to GitHub Pages',
  conclusion,
  completed_at,
  steps: [{ name: 'Publish to GitHub Pages', conclusion: publishStep }],
});
const changes = { name: 'Detect changes', conclusion: 'success', completed_at: '2026-10-28T17:00:00Z', steps: [] };

test('a run with a successful deploy job is a deployment', () => {
  assert.deepEqual(classifyRun([changes, backend('success', 'success'), frontend('skipped', null)]), {
    deployed: true,
    failed: false,
    finishedAt: '2026-10-28T18:00:00Z',
  });
});

test('a run whose deploy jobs were all skipped is not a deployment', () => {
  const run = classifyRun([changes, backend('skipped', null), frontend('skipped', null)]);
  assert.equal(run.deployed, false);
  assert.equal(run.failed, false);
});

test('a deploy that failed before starting is not a failure', () => {
  assert.equal(classifyRun([backend('failure', 'failure')]).failed, false);
});

test('a deploy that failed after starting is a failure, even if another part deployed', () => {
  const run = classifyRun([frontend('success', 'success'), backend('failure', 'success', '2026-10-29T22:06:50Z')]);
  assert.equal(run.deployed, true);
  assert.equal(run.failed, true);
  assert.equal(run.finishedAt, '2026-10-29T22:06:50Z');
});

const run = (id, created_at, head_sha, jobs, conclusion = 'success') => ({ id, created_at, conclusion, head_sha, jobs });

test('metrics for a range: deployments, failures, change failure rate and lead time', () => {
  const runs = [
    run(1, '2026-10-28T10:00:00Z', 'aaa', [backend('success', 'success', '2026-10-28T10:05:00Z')]), // PR 1, before the range
    run(2, '2026-10-29T10:00:00Z', 'bbb', [backend('failure', 'success', '2026-10-29T10:05:00Z')], 'failure'), // PR 2, failed
    run(3, '2026-10-30T10:00:00Z', 'bbb', [backend('success', 'success', '2026-10-30T10:00:00Z')]), // PR 2, manual redeploy
    run(4, '2026-10-30T12:00:00Z', 'ccc', [backend('skipped', null), frontend('skipped', null)]), // docs only
    run(5, '2026-10-30T13:00:00Z', 'aaa', [backend('success', 'success', '2026-10-30T13:05:00Z')]), // PR 1 redeployed
  ];
  const prsBySha = {
    aaa: { number: 1, firstCommitAt: '2026-10-28T08:00:00Z' },
    bbb: { number: 2, firstCommitAt: '2026-10-29T08:00:00Z' },
  };
  const metrics = computeMetrics({ runs, prsBySha, hotfixPrs: [], from: '2026-10-29T00:00:00Z', to: '2026-11-01T00:00:00Z' });

  assert.equal(metrics.deployments, 2); // runs 3 and 5
  assert.equal(metrics.attempts, 3); // runs 2, 3 and 5
  assert.equal(metrics.failedDeployments, 1);
  assert.equal(metrics.changeFailurePercent, 33);
  // Only PR 2 counts: its first clean deploy (run 3) is 26 hours after its first commit.
  // PR 1 was first shipped before the range.
  assert.equal(metrics.medianLeadTimeHours, 26);
  assert.equal(metrics.leadTimeCount, 1);
});

test('a hotfix PR marks the deployment before it as failed', () => {
  const runs = [
    run(1, '2026-10-29T10:00:00Z', 'aaa', [backend('success', 'success', '2026-10-29T10:05:00Z')]),
    run(2, '2026-10-29T15:00:00Z', 'bbb', [backend('success', 'success', '2026-10-29T15:05:00Z')]),
  ];
  const hotfixPrs = [{ number: 9, created_at: '2026-10-29T12:00:00Z' }];
  const metrics = computeMetrics({ runs, prsBySha: {}, hotfixPrs, from: '2026-10-29T00:00:00Z', to: '2026-10-30T00:00:00Z' });

  assert.equal(metrics.failedDeployments, 1);
  assert.deepEqual(metrics.runs.map((r) => r.hotfixed), [true, false]);
});

test('a range with no deploys reports no rates', () => {
  const metrics = computeMetrics({ runs: [], prsBySha: {}, hotfixPrs: [], from: '2026-10-29T00:00:00Z', to: '2026-10-30T00:00:00Z' });
  assert.equal(metrics.deployments, 0);
  assert.equal(metrics.changeFailurePercent, null);
  assert.equal(metrics.medianLeadTimeHours, null);
});

test('each sprint ends when the next one starts; the current one runs until now', () => {
  const sprints = [
    { name: 'Sprint 1', start: '2026-10-21T22:53:50Z' },
    { name: 'Sprint 2', start: '2026-10-28T17:56:07Z' },
    { name: 'Sprint 3', start: '2026-11-04T13:30:00-05:00' },
  ];
  assert.deepEqual(sprintRanges(sprints, '2026-10-30T12:00:00Z'), [
    { name: 'Sprint 1', from: '2026-10-21T22:53:50.000Z', to: '2026-10-28T17:56:07.000Z' },
    { name: 'Sprint 2', from: '2026-10-28T17:56:07.000Z', to: '2026-10-30T12:00:00.000Z' },
  ]);
});

test('a sprint with an end stops there, even after it is over', () => {
  const sprints = [{ name: 'Sprint 6', start: '2026-11-25T13:30:00-05:00', end: '2026-12-01T23:59:59-05:00' }];
  assert.deepEqual(sprintRanges(sprints, '2027-01-15T00:00:00Z'), [
    { name: 'Sprint 6', from: '2026-11-25T18:30:00.000Z', to: '2026-12-02T04:59:59.000Z' },
  ]);
});

test('a run that failed before deploying is reported separately, not as a failed deployment', () => {
  const runs = [
    run(1, '2026-10-28T17:15:52Z', 'aaa', [backend('failure', 'failure')], 'failure'), // e.g. missing secrets
    run(2, '2026-10-28T17:32:13Z', 'aaa', [backend('success', 'success', '2026-10-28T17:34:09Z')]),
  ];
  const metrics = computeMetrics({ runs, prsBySha: {}, hotfixPrs: [], from: '2026-10-28T00:00:00Z', to: '2026-10-29T00:00:00Z' });

  assert.equal(metrics.deployments, 1);
  assert.equal(metrics.attempts, 1);
  assert.equal(metrics.failedDeployments, 0);
  assert.equal(metrics.failedBeforeDeploying, 1);
  assert.deepEqual(metrics.runs.map((r) => [r.id, r.failedBeforeStart]), [[1, true], [2, false]]);
});
