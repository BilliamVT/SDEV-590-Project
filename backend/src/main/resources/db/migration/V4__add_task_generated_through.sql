-- How far each task's occurrences have been generated (BILLIAMVT-38). Generation picks up
-- the day after this, so days nobody viewed still get occurrences (and show as overdue).
-- NULL until the first generation, which starts at starts_on.
alter table task add column generated_through date;
