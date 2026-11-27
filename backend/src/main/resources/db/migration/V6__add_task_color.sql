-- A color the household picks for a task (BILLIAMVT-65). NULL means none. What a color means is up
-- to the household. The names are the app's palette; the front end maps each to a shade that works
-- in light and dark mode, so the database stores the name, not a hex value.
alter table task
    add column color varchar(16)
        constraint task_color_check
            check (color in ('RED', 'ORANGE', 'YELLOW', 'GREEN', 'TEAL', 'BLUE', 'PURPLE', 'PINK'));
