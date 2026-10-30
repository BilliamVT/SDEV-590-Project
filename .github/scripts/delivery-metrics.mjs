#!/usr/bin/env node
// Delivery metrics (DORA-style) per sprint, read from GitHub's API (BILLIAMVT-30).
//
//   node .github/scripts/delivery-metrics.mjs                     every sprint in sprints.json
//   node .github/scripts/delivery-metrics.mjs --from <ISO> [--to <ISO>]   any other range
//
// sprints.json lists each sprint's start: actual times from Jira for past sprints, planned
// times (Wednesday planning, 1:30 PM Eastern) for later ones. A sprint ends at its "end" if it
// has one (the last sprint), otherwise when the next starts; sprints that haven't started yet
// are skipped. If a sprint starts at a different time, correct its line.
//
// Definitions (Change Log, 2026-10-28):
// - Deployment: a Deploy run on main in which at least one deploy job ran and succeeded.
//   Runs whose deploy jobs were all skipped (docs-only merges) are not deployments.
// - Failed deployment: a Deploy run in which a deploy job failed after the deploy started
//   (backend: "Start Render deploy" succeeded; frontend: "Publish to GitHub Pages" ran),
//   or the last deployment before a PR labeled "hotfix" was opened.
// - Change failure rate: failed deployments / deploy attempts (deployments plus failed runs).
// - Lead time: from a PR's first commit to the first Deploy run that shipped it with no failed
//   deploy job (DORA: time for a commit to reach production).
// - Failed before deploying: a Deploy run that failed without any deploy starting (e.g. missing
//   secrets). Production is unaffected, so it isn't a failed deployment; it's reported
//   separately as a process signal.
//
// Runs are assigned to a range by when they started. Set GITHUB_TOKEN to avoid the
// unauthenticated limit of 60 requests an hour; in GitHub Actions it is set automatically.

import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Per deploy job (deploy.yml): the step that shows a deploy actually started, and the step
// results that count. The backend starts once Render accepts the deploy; on the frontend the
// publish step is the deploy, so it counts even if it failed.
const START_STEPS = {
  'Deploy backend to Render': { step: 'Start Render deploy', conclusions: ['success'] },
  'Deploy frontend to GitHub Pages': { step: 'Publish to GitHub Pages', conclusions: ['success', 'failure'] },
};

/** Classifies one Deploy run from its jobs: did it deploy, did a started deploy fail, when did it finish. */
export function classifyRun(jobs) {
  const deployJobs = jobs.filter((job) => job.name in START_STEPS);
  const started = (job) => {
    const { step: name, conclusions } = START_STEPS[job.name];
    return job.steps?.some((step) => step.name === name && conclusions.includes(step.conclusion));
  };
  const ran = deployJobs.filter((job) => job.conclusion !== 'skipped');
  return {
    deployed: deployJobs.some((job) => job.conclusion === 'success'),
    failed: deployJobs.some((job) => job.conclusion === 'failure' && started(job)),
    finishedAt: ran.map((job) => job.completed_at).sort().at(-1) ?? null,
  };
}

/**
 * Computes the metrics for [from, to).
 * runs: Deploy runs on main, each { id, created_at, conclusion, head_sha, jobs }.
 * prsBySha: merged PRs keyed by merge commit SHA, each { number, firstCommitAt }.
 * hotfixPrs: PRs labeled "hotfix", each { number, created_at }.
 */
export function computeMetrics({ runs, prsBySha, hotfixPrs, from, to }) {
  const classified = runs
    .map((run) => ({ ...run, ...classifyRun(run.jobs) }))
    .map((run) => ({ ...run, failedBeforeStart: run.conclusion === 'failure' && !run.failed }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const attempts = classified.filter((run) => run.deployed || run.failed);

  // A hotfix marks the last deployment before it as failed
  const hotfixed = new Set();
  for (const pr of hotfixPrs) {
    const shipped = attempts.filter((run) => run.deployed && run.finishedAt <= pr.created_at).at(-1);
    if (shipped) hotfixed.add(shipped.id);
  }

  // Lead time ends at each PR's first clean deploy, which may be in an earlier range
  const leadTimes = new Map();
  for (const run of attempts) {
    const pr = prsBySha[run.head_sha];
    if (pr && run.deployed && !run.failed && !leadTimes.has(pr.number)) {
      leadTimes.set(pr.number, { runId: run.id, hours: (Date.parse(run.finishedAt) - Date.parse(pr.firstCommitAt)) / 3_600_000 });
    }
  }

  const isInRange = (run) => run.created_at >= from && run.created_at < to;
  const inRange = attempts.filter(isInRange);
  const notStarted = classified.filter((run) => isInRange(run) && run.failedBeforeStart);
  const deployments = inRange.filter((run) => run.deployed);
  const failures = inRange.filter((run) => run.failed || hotfixed.has(run.id));
  const ids = new Set(inRange.map((run) => run.id));
  const hours = [...leadTimes.values()].filter((lead) => ids.has(lead.runId)).map((lead) => lead.hours);

  return {
    deployments: deployments.length,
    attempts: inRange.length,
    failedDeployments: failures.length,
    changeFailurePercent: inRange.length ? Math.round((failures.length / inRange.length) * 100) : null,
    medianLeadTimeHours: hours.length ? round1(median(hours)) : null,
    leadTimeCount: hours.length,
    failedBeforeDeploying: notStarted.length,
    runs: classified.filter((run) => isInRange(run) && (run.deployed || run.failed || run.failedBeforeStart)).map((run) => ({
      id: run.id,
      startedAt: run.created_at,
      deployed: run.deployed,
      failed: run.failed,
      failedBeforeStart: run.failedBeforeStart,
      hotfixed: hotfixed.has(run.id),
      pr: prsBySha[run.head_sha]?.number ?? null,
    })),
  };
}

/** Turns [{ name, start, end? }] into consecutive ranges, up to now; future sprints are left out. */
export function sprintRanges(sprints, now) {
  const end = new Date(now).toISOString();
  return sprints
    .map((sprint, i) => ({
      name: sprint.name,
      from: new Date(sprint.start).toISOString(),
      to: new Date(Math.min(Date.parse(sprint.end ?? sprints[i + 1]?.start ?? end), Date.parse(end))).toISOString(),
    }))
    .filter((range) => range.from < end);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

async function github(repo, path) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  // Retry GitHub's occasional server errors
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers });
    if (response.ok) return response.json();
    if (response.status < 500 || attempt === 3) {
      throw new Error(`GitHub API ${path}: ${response.status} ${await response.text()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
  }
}

async function fetchData(repo) {
  const runs = [];
  for (let page = 1; ; page++) {
    const { workflow_runs } = await github(repo, `/actions/workflows/deploy.yml/runs?branch=main&status=completed&per_page=100&page=${page}`);
    runs.push(...workflow_runs);
    if (workflow_runs.length < 100) break;
  }
  // Runs are skipped when CI failed; those aren't deploy attempts
  const deployRuns = runs.filter((run) => ['success', 'failure'].includes(run.conclusion));
  for (const run of deployRuns) {
    // Jobs of the attempt that set the run's result (a re-run is a new attempt)
    run.jobs = (await github(repo, `/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`)).jobs;
  }

  const prsBySha = {};
  for (const sha of new Set(deployRuns.map((run) => run.head_sha))) {
    const pr = (await github(repo, `/commits/${sha}/pulls`)).find((p) => p.merge_commit_sha === sha);
    if (pr) {
      const commits = await github(repo, `/pulls/${pr.number}/commits?per_page=100`);
      const firstCommitAt = commits.map((commit) => commit.commit.author.date).sort()[0];
      prsBySha[sha] = { number: pr.number, firstCommitAt };
    }
  }

  const closed = await github(repo, '/pulls?state=closed&per_page=100');
  const hotfixPrs = closed
    .filter((pr) => pr.merged_at && pr.labels.some((label) => label.name === 'hotfix'))
    .map((pr) => ({ number: pr.number, created_at: pr.created_at }));

  return { runs: deployRuns, prsBySha, hotfixPrs };
}

function parseRanges(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  if (args.from) {
    const range = { from: new Date(args.from).toISOString(), to: new Date(args.to ?? Date.now()).toISOString() };
    return [{ name: 'Custom range', ...range }];
  }
  const sprints = JSON.parse(readFileSync(new URL('./sprints.json', import.meta.url), 'utf8'));
  return sprintRanges(sprints, Date.now());
}

function failedLabel(run) {
  if (run.failed) return 'yes';
  if (run.hotfixed) return 'yes (hotfix)';
  if (run.failedBeforeStart) return 'before deploying';
  return 'no';
}

function report(metrics, { name, from, to }) {
  const value = (v) => v ?? 'n/a';
  return [
    `## ${name}: ${from} to ${to}`,
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Deployments | ${metrics.deployments} |`,
    `| Median lead time, first commit to live (hrs) | ${value(metrics.medianLeadTimeHours)} (${metrics.leadTimeCount} PRs) |`,
    `| Failed deployments | ${metrics.failedDeployments} of ${metrics.attempts} attempts |`,
    `| Change failure % | ${value(metrics.changeFailurePercent)} |`,
    `| Deploy runs that failed before deploying (not in change failure %) | ${metrics.failedBeforeDeploying} |`,
    '',
    '| Run | Started | PR | Deployed | Failed |',
    '|---|---|---|---|---|',
    ...metrics.runs.map((run) =>
      `| ${run.id} | ${run.startedAt} | ${run.pr ? `#${run.pr}` : ''} | ${run.deployed ? 'yes' : 'no'} | ${failedLabel(run)} |`),
    '',
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ranges = parseRanges(process.argv.slice(2));
  const data = await fetchData(process.env.GITHUB_REPOSITORY ?? 'BilliamVT/SDEV-590-Project');
  const output = ranges.map((range) => report(computeMetrics({ ...data, ...range }), range)).join('\n');
  console.log(output);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, output);
}
