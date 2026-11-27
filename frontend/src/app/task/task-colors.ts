/**
 * The colors a household can give a task (BILLIAMVT-65), by the names the backend stores. What a
 * color means is up to the household. Each shade (styles.scss, --task-*) is at least 4:1 against
 * the page and the today card in light and dark mode, above the 3:1 WCAG asks of non-text.
 */
export type TaskColor = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'TEAL' | 'BLUE' | 'PURPLE' | 'PINK';

export const TASK_COLORS: readonly { value: TaskColor; label: string }[] = [
  { value: 'RED', label: 'Red' },
  { value: 'ORANGE', label: 'Orange' },
  { value: 'YELLOW', label: 'Yellow' },
  { value: 'GREEN', label: 'Green' },
  { value: 'TEAL', label: 'Teal' },
  { value: 'BLUE', label: 'Blue' },
  { value: 'PURPLE', label: 'Purple' },
  { value: 'PINK', label: 'Pink' },
];

/** "Teal" for TEAL; screen readers hear it with the task's name */
export function colorLabel(color: TaskColor): string {
  return TASK_COLORS.find((c) => c.value === color)?.label ?? color;
}
