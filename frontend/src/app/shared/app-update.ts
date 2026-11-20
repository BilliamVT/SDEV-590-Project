import { DOCUMENT, Injectable, inject } from '@angular/core';

/**
 * Picks up a new deploy in an app that stays open (BILLIAMVT-53). From the home screen there's no
 * reload button, and iOS can keep the app in the background for days, still running the version it
 * started with. So whenever the app comes back into view, this fetches the current index.html and
 * compares its main script (named with a content hash at build time) with the one running. If a
 * newer one is out, the page reloads to it.
 *
 * It doesn't reload while an action sheet is open or a form has unsaved changes; the next time the
 * app comes back into view, it checks again. In development the script has no hash, so it never
 * reloads.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdate {
  private readonly document = inject(DOCUMENT);
  /** Replaced in tests */
  reload = () => this.document.location.reload();

  /** Listens for the app coming back into view. Called once, by the app shell. */
  start(): void {
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'visible') {
        void this.check();
      }
    });
  }

  /** True if it found a newer version and reloaded. */
  async check(): Promise<boolean> {
    const running = mainScript(this.document.documentElement.outerHTML);
    if (!running) {
      return false;
    }
    let latest: string | null;
    try {
      const response = await fetch(this.document.baseURI, { cache: 'no-store' });
      if (!response.ok) {
        return false;
      }
      latest = mainScript(await response.text());
    } catch {
      // Offline or a network hiccup: keep running this version
      return false;
    }
    if (!latest || latest === running || this.busy()) {
      return false;
    }
    this.reload();
    return true;
  }

  /** Something the user would lose on a reload: an open action sheet or a changed form. */
  private busy(): boolean {
    return this.document.querySelector('dialog[open], form.ng-dirty') !== null;
  }
}

/** The main script's file name in a page, e.g. "main-YVLR4WOF.js", or null. */
export function mainScript(html: string): string | null {
  return /<script[^>]+src="([^"]*main[^"]*\.js)"/.exec(html)?.[1] ?? null;
}
