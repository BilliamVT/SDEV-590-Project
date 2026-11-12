import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { BacklogService } from '../backlog/backlog.service';
import { HealthService } from '../health/health.service';
import { HouseholdService } from '../household/household.service';
import { ScheduleService } from '../schedule/schedule.service';
import { WeekView } from '../schedule/week-view';
import { Home } from './home';

describe('Home', () => {
  let backlog: { list: ReturnType<typeof vi.fn> };
  beforeEach(() => (backlog = { list: vi.fn(() => NEVER) }));

  let lastFixture: ComponentFixture<Home>;

  async function render(status: Observable<string>, savedTask?: { name: string; schedule: string }): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideRouter([]),
        { provide: HealthService, useValue: { status: () => status } },
        { provide: HouseholdService, useValue: { load: () => NEVER } },
        { provide: ScheduleService, useValue: { between: () => NEVER } },
        { provide: BacklogService, useValue: backlog },
        { provide: AuthService, useValue: { user: signal({ id: 2, email: 'bill@example.com', displayName: 'Bill' }) } },
      ],
    }).compileComponents();
    if (savedTask) {
      vi.spyOn(TestBed.inject(Router), 'currentNavigation').mockReturnValue({ extras: { state: { savedTask } } } as never);
    }
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    lastFixture = fixture;
    return fixture.nativeElement as HTMLElement;
  }

  it('confirms a task that was just saved, with a link to add another', async () => {
    const element = await render(NEVER, { name: 'Vacuum', schedule: 'every week on Saturday' });
    const notice = element.querySelector('.notice');
    expect(notice?.textContent).toContain('Saved: Vacuum, every week on Saturday.');
    expect(notice?.querySelector('a[href="/tasks/new"]')?.textContent).toBe('Add another');
  });

  it('shows no notice on a normal visit', async () => {
    const element = await render(NEVER);
    expect(element.querySelector('.notice')).toBeNull();
  });

  it('shows the week view', async () => {
    const element = await render(NEVER);
    expect(element.querySelector('app-week-view')).not.toBeNull();
  });

  it('shows the backlog under the week, and reloads it when the week changes (BILLIAMVT-23)', async () => {
    const element = await render(NEVER);
    expect(element.querySelector('app-week-view + app-backlog')).not.toBeNull();
    expect(backlog.list).toHaveBeenCalledTimes(1);

    lastFixture.debugElement.query(By.directive(WeekView)).componentInstance.changed.emit();

    expect(backlog.list).toHaveBeenCalledTimes(2);
  });

  it('links to adding a task', async () => {
    const element = await render(NEVER);
    expect(element.querySelector('a[href="/tasks/new"]')?.textContent).toBe('Add a task');
  });

  it('welcomes the signed-in user', async () => {
    const element = await render(NEVER);
    expect(element.textContent).toContain('Welcome, Bill.');
  });

  it('explains the wait while the server is waking up', async () => {
    const element = await render(NEVER);
    expect(element.querySelector('[data-state]')?.getAttribute('data-state')).toBe('checking');
    expect(element.textContent).toContain('up to a minute');
  });

  it('shows the server as running when health is UP', async () => {
    const element = await render(of('UP'));
    expect(element.querySelector('[data-state]')?.getAttribute('data-state')).toBe('up');
    expect(element.textContent).toContain('The server and database are running');
  });

  it('shows the reported status when health is not UP', async () => {
    const element = await render(of('DOWN'));
    expect(element.querySelector('[data-state]')?.getAttribute('data-state')).toBe('down');
    expect(element.textContent).toContain('status: DOWN');
  });

  it('shows an unreachable message when the call fails', async () => {
    const element = await render(throwError(() => new Error('network error')));
    expect(element.querySelector('[data-state]')?.getAttribute('data-state')).toBe('unreachable');
    expect(element.textContent).toContain("couldn't be reached");
  });
});
