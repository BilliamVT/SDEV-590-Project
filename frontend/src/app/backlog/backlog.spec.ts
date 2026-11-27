import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { HouseholdService } from '../household/household.service';
import { toIsoDate } from '../schedule/dates';
import { Backlog } from './backlog';
import { BacklogItem, CreateItemRequest } from './backlog.models';
import { BacklogService } from './backlog.service';
import { Toast } from '../shared/toast';

const shelves: BacklogItem = { id: 1, name: 'Hang shelves', estimatedMinutes: 45, assigneeId: null, color: null };
const gutters: BacklogItem = { id: 2, name: 'Clean gutters', estimatedMinutes: null, assigneeId: null, color: null };
const MEMBERS = [
  { id: 1, displayName: 'Pat Lee' },
  { id: 2, displayName: 'Sam Ray' },
];

/** The delete action sheet (BILLIAMVT-49): whether it's open, and what it asks. */
const sheetOpen = (element: HTMLElement) => element.querySelector('dialog.sheet')!.hasAttribute('open');
const sheetMessage = (element: HTMLElement) => element.querySelector('dialog.sheet .message')?.textContent?.trim();

describe('Backlog (BILLIAMVT-23)', () => {
  // Wednesday Nov 11, 2026
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 11, 12));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function render(
    overrides: Partial<{
      list: () => Observable<BacklogItem[]>;
      create: (request: CreateItemRequest) => Observable<BacklogItem>;
      schedule: (id: number, date: string) => Observable<void>;
      done: (id: number, date: string) => Observable<void>;
      delete: (id: number) => Observable<void>;
      assign: (id: number, assigneeId: number | null) => Observable<BacklogItem>;
      today: () => string;
    }> = {},
  ) {
    const backlog = {
      list: vi.fn(overrides.list ?? (() => of([shelves, gutters]))),
      create: vi.fn(
        overrides.create ?? ((r: CreateItemRequest) => of({ id: 3, name: r.name, estimatedMinutes: r.estimatedMinutes ?? null, assigneeId: null, color: null })),
      ),
      schedule: vi.fn(overrides.schedule ?? (() => of(undefined))),
      done: vi.fn(overrides.done ?? (() => of(undefined))),
      delete: vi.fn(overrides.delete ?? (() => of(undefined))),
      assign: vi.fn(overrides.assign ?? (() => of(shelves))),
    };
    await TestBed.configureTestingModule({
      imports: [Backlog],
      providers: [
        { provide: BacklogService, useValue: backlog },
        // The household's today; the device's by default
        {
          provide: HouseholdService,
          useValue: { today: overrides.today ?? (() => toIsoDate(new Date())), members: signal(MEMBERS) },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Backlog);
    const placed = vi.fn();
    fixture.componentInstance.placed.subscribe(placed);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const names = () => [...element.querySelectorAll('.item .name')].map((n) => n.textContent);
    const button = (label: string) =>
      [...element.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === label)!;
    const click = async (label: string) => {
      button(label).click();
      await fixture.whenStable();
    };
    const set = async (selector: string, value: string) => {
      const input = element.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const submit = async () => {
      element.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };
    return { backlog, fixture, element, placed, names, button, click, set, submit };
  }

  it("shows Schedule on each item, and Mark done and Delete under ⋯ (BILLIAMVT-49)", async () => {
    const { element, click, button } = await render();
    expect(button('Schedule Hang shelves')).toBeDefined();
    expect(element.querySelector('.menu')).toBeNull();

    await click('More for Hang shelves');
    expect([...element.querySelectorAll('.menu button')].map((b) => b.textContent?.trim())).toEqual(['Mark done', 'Assign', 'Delete']);
    await click('More for Hang shelves');
    expect(element.querySelector('.menu')).toBeNull();
  });

  describe('assigning an item (BILLIAMVT-64)', () => {
    const assignSheet = (element: HTMLElement) => element.querySelectorAll<HTMLDialogElement>('dialog.sheet')[1];
    const assigned = (id: number, assigneeId: number | null) => of({ ...shelves, assigneeId });

    it("shows who an item is for by first name, and nothing for Anyone", async () => {
      const { element } = await render({ list: () => of([{ ...shelves, assigneeId: 2 }, gutters]) });
      const rows = element.querySelectorAll('.item');
      expect(rows[0].querySelector('.assignee')?.textContent).toBe('Assigned to Sam');
      expect(rows[1].querySelector('.assignee')).toBeNull();
    });

    it("asks who's doing it in an action sheet, assigns it, and offers Undo", async () => {
      const { backlog, element, click, fixture } = await render({ assign: assigned });

      await click('More for Hang shelves');
      await click('Assign: Hang shelves');
      expect(assignSheet(element).hasAttribute('open')).toBe(true);
      expect(assignSheet(element).querySelector('.message')?.textContent?.trim()).toBe("Who's doing Hang shelves?");
      const choices = [...assignSheet(element).querySelectorAll('.choice')];
      expect(choices.map((c) => c.textContent?.trim())).toEqual(['Anyone', 'Pat Lee', 'Sam Ray']);
      expect(choices[0].querySelector('input')!.checked).toBe(true);

      choices[2].querySelector('input')!.click();
      await fixture.whenStable();
      [...assignSheet(element).querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Assign')!.click();
      await fixture.whenStable();

      expect(backlog.assign).toHaveBeenCalledWith(1, 2);
      expect(assignSheet(element).hasAttribute('open')).toBe(false);
      expect(element.querySelector('.item .assignee')?.textContent).toBe('Assigned to Sam');
      const toast = TestBed.inject(Toast);
      expect(toast.message()).toBe('Hang shelves: Sam.');
      expect(toast.action()?.label).toBe('Undo');

      toast.act();
      await fixture.whenStable();
      expect(backlog.assign).toHaveBeenLastCalledWith(1, null);
      expect(element.querySelector('.item .assignee')).toBeNull();
      expect(toast.message()).toBe('Hang shelves: back to Anyone.');
      expect(toast.action()).toBeNull();
    });

    it('reloads with a notice when the item already left the backlog', async () => {
      const { element, click, fixture } = await render({
        assign: () => throwError(() => new HttpErrorResponse({ status: 404 })),
      });
      await click('More for Hang shelves');
      await click('Assign: Hang shelves');
      [...assignSheet(element).querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Assign')!.click();
      await fixture.whenStable();

      expect(assignSheet(element).hasAttribute('open')).toBe(false);
      expect(element.querySelector('.notice')?.textContent).toContain('Hang shelves is no longer on the backlog.');
    });
  });

  it("shows an item's color as a dot before its name (BILLIAMVT-65)", async () => {
    const { element } = await render({ list: () => of([{ ...shelves, color: 'PURPLE' }, gutters]) });
    const rows = element.querySelectorAll('.item');
    expect(rows[0].querySelector('.task-color-dot')?.getAttribute('data-color')).toBe('PURPLE');
    expect(rows[0].querySelector('.name')?.textContent?.trim()).toBe('Purple: Hang shelves');
    expect(rows[1].querySelector('.task-color-dot')).toBeNull();
  });

  it('lists the items in the order added, with minutes', async () => {
    const { element, names } = await render();

    expect(element.querySelector('h2')?.textContent).toBe('Backlog');
    expect(names()).toEqual(['Hang shelves', 'Clean gutters']);
    expect(element.querySelector('.item .minutes')?.textContent).toBe('45 min');
  });

  it('says when the backlog is empty', async () => {
    const { element } = await render({ list: () => of([]) });
    expect(element.querySelector('.empty')?.textContent).toBe('Nothing in the backlog.');
  });

  it('adds an item to the end of the list, minutes optional', async () => {
    const { backlog, element, names, set, submit } = await render();
    await set('#backlog-name', '  Fix the fence  ');
    await submit();

    expect(backlog.create).toHaveBeenCalledWith({ name: 'Fix the fence' });
    expect(names()).toEqual(['Hang shelves', 'Clean gutters', 'Fix the fence']);
    expect(element.querySelector<HTMLInputElement>('#backlog-name')?.value).toBe('');

    await set('#backlog-name', 'Paint the door');
    await set('#backlog-minutes', '90');
    await submit();
    expect(backlog.create).toHaveBeenLastCalledWith({ name: 'Paint the door', estimatedMinutes: 90 });
  });

  it('needs a name', async () => {
    const { backlog, element, set, submit } = await render();
    await set('#backlog-name', '   ');
    await submit();

    expect(backlog.create).not.toHaveBeenCalled();
    expect(element.querySelector('.field-error')?.textContent).toBe('Enter a name of up to 100 characters.');
  });

  it('marks an item done on today by default, then moves it to the week', async () => {
    const { backlog, element, placed, names, click } = await render();
    await click('More for Hang shelves');
    await click('Mark done: Hang shelves');

    const day = element.querySelector<HTMLInputElement>('#backlog-day-1')!;
    expect(day.value).toBe('2026-11-11');
    expect(day.max).toBe('2026-11-11');
    expect(day.min).toBe('');
    await click('Mark done');

    expect(backlog.done).toHaveBeenCalledWith(1, '2026-11-11');
    expect(names()).toEqual(['Clean gutters']);
    // A toast, not a notice in the page (BILLIAMVT-57)
    expect(TestBed.inject(Toast).message()).toBe('Marked "Hang shelves" done on Wednesday, Nov 11.');
    expect(element.querySelector('.notice')).toBeNull();
    expect(placed).toHaveBeenCalledTimes(1);
  });

  it("starts the day picker on the household's today, not the device's (BILLIAMVT-51)", async () => {
    // The household is a day ahead of this device
    const { backlog, element, click } = await render({ today: () => '2026-11-12' });
    await click('More for Hang shelves');
    await click('Mark done: Hang shelves');
    const day = () => element.querySelector<HTMLInputElement>('#backlog-day-1')!;
    expect(day().value).toBe('2026-11-12');
    expect(day().max).toBe('2026-11-12');
    await click('Mark done');
    expect(backlog.done).toHaveBeenCalledWith(1, '2026-11-12');

    await click('Schedule Clean gutters');
    const schedule = element.querySelector<HTMLInputElement>('#backlog-day-2')!;
    expect(schedule.value).toBe('2026-11-12');
    expect(schedule.min).toBe('2026-11-12');
  });

  it('marks an item done on an earlier day', async () => {
    const { backlog, click, set } = await render();
    await click('More for Hang shelves');
    await click('Mark done: Hang shelves');
    await set('#backlog-day-1', '2026-11-09');
    await click('Mark done');

    expect(backlog.done).toHaveBeenCalledWith(1, '2026-11-09');
  });

  it('schedules an item on a day from today on', async () => {
    const { backlog, element, placed, names, click, set } = await render();
    await click('Schedule Clean gutters');

    const day = element.querySelector<HTMLInputElement>('#backlog-day-2')!;
    expect(day.min).toBe('2026-11-11');
    expect(day.max).toBe('');
    await set('#backlog-day-2', '2026-11-13');
    await click('Add to day');

    expect(backlog.schedule).toHaveBeenCalledWith(2, '2026-11-13');
    expect(names()).toEqual(['Hang shelves']);
    expect(TestBed.inject(Toast).message()).toBe('"Clean gutters" is on Friday, Nov 13.');
    expect(element.querySelector('.notice')).toBeNull();
    expect(placed).toHaveBeenCalledTimes(1);
  });

  it('cancels choosing a day', async () => {
    const { backlog, element, click } = await render();
    await click('Schedule Clean gutters');
    await click('Cancel');

    expect(element.querySelector('#backlog-day-2')).toBeNull();
    expect(backlog.schedule).not.toHaveBeenCalled();
  });

  it("keeps the item and shows the server's reason when it fails", async () => {
    const rejected = new HttpErrorResponse({ status: 400, error: { detail: 'Choose a day from today on.' } });
    const { element, placed, names, click } = await render({ schedule: () => throwError(() => rejected) });
    await click('Schedule Clean gutters');
    await click('Add to day');

    expect(names()).toEqual(['Hang shelves', 'Clean gutters']);
    expect(element.querySelector('.item-error')?.textContent).toBe('Choose a day from today on.');
    expect(placed).not.toHaveBeenCalled();
  });

  it('deletes an item after confirming in an action sheet, not a browser popup (BILLIAMVT-49)', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { backlog, element, names, click } = await render();

    await click('More for Hang shelves');
    await click('Delete: Hang shelves');
    expect(confirm).not.toHaveBeenCalled();
    expect(sheetOpen(element)).toBe(true);
    expect(sheetMessage(element)).toBe("Delete Hang shelves? This can't be undone.");
    await click('Cancel');
    expect(sheetOpen(element)).toBe(false);
    expect(backlog.delete).not.toHaveBeenCalled();

    await click('More for Hang shelves');
    await click('Delete: Hang shelves');
    await click('Delete');
    expect(backlog.delete).toHaveBeenCalledWith(1);
    expect(names()).toEqual(['Clean gutters']);
  });

  it('reloads when asked, so a skipped day comes back, and clears the last notice', async () => {
    let items = [shelves, gutters];
    // A notice now only explains something that changed elsewhere (BILLIAMVT-57): here, a 404
    const { fixture, element, names, click } = await render({
      list: () => of(items),
      done: () => throwError(() => new HttpErrorResponse({ status: 404 })),
    });
    await click('More for Hang shelves');
    await click('Mark done: Hang shelves');
    await click('Mark done');
    expect(element.querySelector('.notice')).not.toBeNull();
    items = [shelves, gutters];

    fixture.componentInstance.reload();
    await fixture.whenStable();

    expect(names()).toEqual(['Hang shelves', 'Clean gutters']);
    expect(element.querySelector('.notice')).toBeNull();
  });

  it('clears the last notice when choosing another day', async () => {
    const { element, click } = await render({ done: () => throwError(() => new HttpErrorResponse({ status: 404 })) });
    await click('More for Hang shelves');
    await click('Mark done: Hang shelves');
    await click('Mark done');
    expect(element.querySelector('.notice')).not.toBeNull();
    await click('Schedule Clean gutters');

    expect(element.querySelector('.notice')).toBeNull();
  });

  it('shows the backlog once a household exists and it reloads (BILLIAMVT-47)', async () => {
    let household = false;
    const { element, fixture } = await render({
      list: () => (household ? of([shelves]) : throwError(() => new HttpErrorResponse({ status: 404 }))),
    });
    expect(element.querySelector('.backlog')).toBeNull();

    household = true;
    fixture.componentInstance.reload();
    await fixture.whenStable();

    expect(element.querySelector('.backlog')).not.toBeNull();
  });

  describe('when an item changed elsewhere (BILLIAMVT-55)', () => {
    const notice = (element: HTMLElement) =>
      element.querySelector('.notice[role="status"]')?.textContent?.trim();

    it('reloads silently when the app comes back into view', async () => {
      const { backlog, element, fixture } = await render();
      expect(backlog.list).toHaveBeenCalledTimes(1);

      document.dispatchEvent(new Event('visibilitychange'));
      await fixture.whenStable();

      expect(backlog.list).toHaveBeenCalledTimes(2);
      expect(notice(element)).toBeUndefined();
    });

    it('says an item already put on a day or deleted is gone, without guessing who, and reloads both lists', async () => {
      let calls = 0;
      const { backlog, element, click, placed } = await render({
        list: () => of(calls++ === 0 ? [shelves, gutters] : [gutters]),
        done: () => throwError(() => new HttpErrorResponse({ status: 404 })),
      });

      await click('More for Hang shelves');
      await click('Mark done: Hang shelves');
      await click('Mark done');

      expect(notice(element)).toBe(
        'Hang shelves is no longer on the backlog. Your week and backlog are up to date.',
      );
      expect(backlog.list).toHaveBeenCalledTimes(2);
      expect(placed).toHaveBeenCalled();
      expect(element.querySelector('.item-error')).toBeNull();
      // The day picker closed
      expect(element.querySelector('#backlog-day-1')).toBeNull();
    });

    it('still shows other errors on the item', async () => {
      const { element, click } = await render({
        done: () => throwError(() => new HttpErrorResponse({ status: 500 })),
      });

      await click('More for Hang shelves');
      await click('Mark done: Hang shelves');
      await click('Mark done');

      expect(notice(element)).toBeUndefined();
      expect(element.querySelector('.item-error')).not.toBeNull();
    });
  });

  it('shows nothing without a household', async () => {
    const { element } = await render({ list: () => throwError(() => new HttpErrorResponse({ status: 404 })) });
    expect(element.querySelector('.backlog')).toBeNull();
  });
});
