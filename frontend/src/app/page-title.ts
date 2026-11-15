import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const APP_NAME = 'Housework Scheduler';

/**
 * Each page has its own browser title, e.g. "Your tasks – Housework Scheduler" (WCAG 2.4.2,
 * BILLIAMVT-49). Screen readers announce it when the page changes, so users know where they are.
 */
@Injectable()
export class PageTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.title.setTitle(page ? `${page} – ${APP_NAME}` : APP_NAME);
  }
}
