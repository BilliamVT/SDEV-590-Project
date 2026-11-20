-- Share of scheduled tasks completed, by household and week (BILLIAMVT-31).
--
-- Read-only: it runs in a read-only transaction, so Postgres refuses any write. Run it against production with
-- Render's external database URL (Render → the Postgres instance → Connect → External), e.g.
--   psql "<external database URL>" -f docs/metrics/completion-share.sql
-- and record the household's weekly row in the "Capstone Sprint Metrics" sheet.
--
-- What counts:
--   * Days of recurring tasks, Sunday to Saturday weeks (as in the app), from the household's first
--     full week (Sun Nov 22) on; earlier use was pre-rollout testing.
--   * Only days before today in the household's time zone: today can still be done.
--   * due = every such day; done / skipped by status; missed = still pending.
--   * done_pct = done ÷ due. done_pct_excl_skipped = done ÷ (due − skipped), since a skip is a
--     deliberate "not this time" rather than a miss.
--   * Days of deleted tasks are kept as history, so they still count.
-- Left out:
--   * The smoke test's household (BILLIAMVT-48), which has no tasks anyway.
--   * One-off backlog items: marking one done adds a day that was never scheduled, which would
--     inflate the share.
begin transaction read only;

with households as (
    select id, name, (now() at time zone time_zone)::date as today
    from household
    where name <> 'Smoke test'
),
days as (
    select h.name                                                    as household,
           o.scheduled_date - extract(dow from o.scheduled_date)::int as week_start,
           o.status
    from occurrence o
    join task t on t.id = o.task_id
    join households h on h.id = t.household_id
    where t.recurrence_rule is not null
      and o.scheduled_date >= date '2026-11-22' -- the household week starts Sun Nov 22 (Change Log)
      and o.scheduled_date < h.today
)
select household,
       week_start,
       week_start + 6                                       as week_end,
       count(*)                                             as due,
       count(*) filter (where status = 'DONE')              as done,
       count(*) filter (where status = 'SKIPPED')           as skipped,
       count(*) filter (where status = 'PENDING')           as missed,
       round(100.0 * count(*) filter (where status = 'DONE') / count(*), 1) as done_pct,
       round(100.0 * count(*) filter (where status = 'DONE')
             / nullif(count(*) filter (where status <> 'SKIPPED'), 0), 1)   as done_pct_excl_skipped
from days
group by household, week_start
order by household, week_start;

rollback;
