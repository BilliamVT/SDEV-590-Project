import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { HouseholdService } from '../household/household.service';
import { toIsoDate } from '../schedule/dates';
import { Backlog } from './backlog';
import { BacklogItem, CreateItemRequest } from './backlog.models';
import { BacklogService } from './backlog.service';

const shelves: BacklogItem = { id: 1, name: 'Hang shelves', estimatedMinutes: 45 };
const gutters: BacklogItem = { id: 2, name: 'Clean gutters', estimatedMinutes: null };

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
      today: () => string;
    }> = {},
  ) {
    const backlog = {
      list: vi.fn(overrides.list ?? (() => of([shelves, gutters]))),
      create: vi.fn(overrides.create ?? ((r: CreateItemRequest) => of({ id: 3, name: r.name, estimatedMinutes: r.estimatedMinutes ?? null }))),
      schedule: vi.fn(overrides.schedule ?? (() => of(undefined))),
      done: vi.fn(overrides.done ?? (() => of(undefined))),
      delete: vi.fn(overrides.delete ?? (() => of(undefined))),
    };
    await TestBed.configureTestingModule({
      imports: [Backlog],
      providers: [
        { provide: BacklogService, useValue: backlog },
        // The household's today; the device's by default
        { provide: HouseholdService, useValue: { today: overrides.today ?? (() => toIsoDate(new Date())) } },
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
    await click('Mark Hang shelves done');

    const day = element.querySelector<HTMLInputElement>('#backlog-day-1')!;
    expect(day.value).toBe('2026-11-11');
    expect(day.max).toBe('2026-11-11');
    expect(day.min).toBe('');
    await click('Mark done');

    expect(backlog.done).toHaveBeenCalledWith(1, '2026-11-11');
    expect(names()).toEqual(['Clean gutters']);
    expect(element.querySelector('.notice')?.textContent).toBe('Marked "Hang shelves" done on Wednesday, Nov 11.');
    expect(placed).toHaveBeenCalledTimes(1);
  });

  it("starts the day picker on the household's today, not the device's (BILLIAMVT-51)", async () => {
    // The household is a day ahead of this device
    const { backlog, element, click } = await render({ today: () => '2026-11-12' });
    await click('Mark Hang shelves done');
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
    await click('Mark Hang shelves done');
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
    expect(element.querySelector('.notice')?.textContent).toBe('"Clean gutters" is on Friday, Nov 13.');
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

  it('deletes an item after confirming', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { backlog, names, click } = await render();

    await click('Delete Hang shelves');
    expect(backlog.delete).not.toHaveBeenCalled();

    await click('Delete Hang shelves');
    expect(confirm).toHaveBeenLastCalledWith('Delete "Hang shelves" from the backlog?');
    expect(backlog.delete).toHaveBeenCalledWith(1);
    expect(names()).toEqual(['Clean gutters']);
  });

  it('reloads when asked, so a skipped day comes back, and clears the last notice', async () => {
    let items = [shelves, gutters];
    const { fixture, element, names, click } = await render({ list: () => of(items) });
    await click('Mark Hang shelves done');
    await click('Mark done');
    expect(element.querySelector('.notice')).not.toBeNull();
    items = [shelves, gutters];

    fixture.componentInstance.reload();
    await fixture.whenStable();

    expect(names()).toEqual(['Hang shelves', 'Clean gutters']);
    expect(element.querySelector('.notice')).toBeNull();
  });

  it('clears the last notice when choosing another day', async () => {
    const { element, click } = await render();
    await click('Mark Hang shelves done');
    await click('Mark done');
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

  it('shows nothing without a household', async () => {
    const { element } = await render({ list: () => throwError(() => new HttpErrorResponse({ status: 404 })) });
    expect(element.querySelector('.backlog')).toBeNull();
  });
});
