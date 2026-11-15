/*
 * Keeping keyboard and screen-reader users in place (BILLIAMVT-49). When a button they used
 * disappears (a menu closes, a row is deleted) or a form has errors, focus would otherwise fall
 * back to the top of the page. These run after Angular has updated the page.
 */

/** Focuses the first element matching the selector inside the host, once the page has updated. */
export function focusLater(host: HTMLElement, selector: string): void {
  setTimeout(() => {
    const target = host.querySelector<HTMLElement>(selector);
    if (target) {
      focusable(target).focus();
    }
  });
}

/** After a submit with errors, focuses the first field marked invalid. */
export function focusFirstInvalid(host: HTMLElement): void {
  focusLater(host, '[aria-invalid="true"]');
}

/** A group (e.g. the day toggles) can't take focus itself; its first control can. */
function focusable(element: HTMLElement): HTMLElement {
  if (element.tabIndex >= 0 || element.hasAttribute('tabindex')) {
    return element;
  }
  return element.querySelector<HTMLElement>('button, input, select, textarea, a[href]') ?? element;
}
