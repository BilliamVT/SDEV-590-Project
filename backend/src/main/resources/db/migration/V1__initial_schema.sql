-- Initial schema: households, their members, recurring/one-off tasks,
-- and the generated occurrences that make up the schedule.
--
-- Delete behaviour (see BILLIAMVT-41, account deletion):
--   household -> task -> occurrence   cascade: removing a household removes its schedule
--                                      (deleting a single task is a soft delete via deleted_at)
--   household <- app_user             restrict: a household can't be deleted while it has members
--   app_user  <- occurrence.completed_by  set null: deleting a user keeps the household's
--                                      history but no longer records who completed it
--
-- Every table has created_at / updated_at. updated_at is maintained by the
-- application (Hibernate @UpdateTimestamp), not by a database trigger.

create table household (
    id         bigint generated always as identity primary key,
    name       text        not null,
    -- IANA zone (e.g. America/New_York), captured from the browser at sign-up.
    -- Decides what "today" is for the household's schedule.
    time_zone  text        not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- "user" is a reserved word in Postgres
create table app_user (
    id           bigint generated always as identity primary key,
    household_id bigint      references household (id),
    -- Stored lowercased so lookups are exact matches on a plain unique index
    email        text        not null unique check (email = lower(email)),
    display_name text        not null,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index app_user_household_id_idx on app_user (household_id);

create table task (
    id                bigint generated always as identity primary key,
    household_id      bigint      not null references household (id) on delete cascade,
    name              text        not null,
    -- RFC 5545 RRULE, e.g. FREQ=WEEKLY;BYDAY=SA. NULL means a one-off backlog item.
    recurrence_rule   text,
    -- Anchor for the recurrence (RFC 5545 DTSTART); required exactly when there is a rule
    starts_on         date,
    estimated_minutes integer     check (estimated_minutes > 0),
    -- false = paused: still listed, but generates no new occurrences
    active            boolean     not null default true,
    -- Soft delete: hidden from the app, but past occurrences (history) are kept
    deleted_at        timestamptz,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    constraint task_starts_on_matches_rule check ((recurrence_rule is null) = (starts_on is null))
);

create index task_household_id_idx on task (household_id);

create table occurrence (
    id             bigint generated always as identity primary key,
    task_id        bigint      not null references task (id) on delete cascade,
    -- The date the recurrence rule produced (or the day a backlog item was first
    -- scheduled to). Schedule generation matches on this, so moving an occurrence
    -- never causes a duplicate. "Moved" means scheduled_date <> original_date.
    original_date  date        not null,
    scheduled_date date        not null,
    status         text        not null default 'PENDING'
                               check (status in ('PENDING', 'DONE', 'SKIPPED')),
    completed_by   bigint      references app_user (id) on delete set null,
    completed_at   timestamptz,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    constraint occurrence_task_id_original_date_key unique (task_id, original_date)
);

create index occurrence_scheduled_date_idx on occurrence (scheduled_date);
create index occurrence_completed_by_idx on occurrence (completed_by);
