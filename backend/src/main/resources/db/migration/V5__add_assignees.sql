-- Who is meant to do a task (BILLIAMVT-64). NULL means Anyone.
--
-- task.assigned_to is the whole task's assignee. A single day can have its own: once
-- occurrence.assignment_set is true, occurrence.assigned_to is that day's assignee (NULL = Anyone
-- for that day) and the task's assignee no longer applies to it. Days that were never changed
-- follow the task, so changing the task's assignee changes them too.
--
-- Deleting an account unassigns it (set null), as completed_by does (V1). Leaving a household is
-- handled by the application, since the account itself stays.
alter table task add column assigned_to bigint references app_user (id) on delete set null;

alter table occurrence
    add column assigned_to    bigint  references app_user (id) on delete set null,
    add column assignment_set boolean not null default false;

create index task_assigned_to_idx on task (assigned_to);
create index occurrence_assigned_to_idx on occurrence (assigned_to);
