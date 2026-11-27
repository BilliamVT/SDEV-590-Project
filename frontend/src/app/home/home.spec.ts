import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { NEVER } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { BacklogService } from '../backlog/backlog.service';
import { HouseholdService } from '../household/household.service';
import { ScheduleService } from '../schedule/schedule.service';
import { WeekView } from '../schedule/week-view';
import { Home } from './home';

describe('Home', () => {
  let backlog: { list: ReturnType<typeof vi.fn> };
  beforeEach(() => (backlog = { list: vi.fn(() => NEVER) }));

  let lastFixture: ComponentFixture<Home>;

  async function render(): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideRouter([]),
        { provide: HouseholdService, useValue: { load: () => NEVER, members: () => [] } },
        { provide: ScheduleService, useValue: { between: () => NEVER } },
        { provide: BacklogService, useValue: backlog },
        { provide: AuthService, useValue: { user: signal({ id: 2, email: 'bill@example.com', displayName: 'Bill' }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    lastFixture = fixture;
    return fixture.nativeElement as HTMLElement;
  }

  it('shows no notice on a normal visit; "Saved" is a toast from the form (BILLIAMVT-57)', async () => {
    const element = await render();
    expect(element.querySelector('.notice')).toBeNull();
  });

  it('shows the week view', async () => {
    const element = await render();
    expect(element.querySelector('app-week-view')).not.toBeNull();
  });

  it('shows the backlog under the week, and reloads it when the week changes (BILLIAMVT-23)', async () => {
    const element = await render();
    expect(element.querySelector('app-week-view + app-backlog')).not.toBeNull();
    expect(backlog.list).toHaveBeenCalledTimes(1);

    lastFixture.debugElement.query(By.directive(WeekView)).componentInstance.changed.emit();

    expect(backlog.list).toHaveBeenCalledTimes(2);
  });

  it('links to adding a task', async () => {
    const element = await render();
    expect(element.querySelector('a[href="/tasks/new"]')?.textContent).toBe('Add a task');
  });

  it('welcomes the signed-in user', async () => {
    const element = await render();
    expect(element.textContent).toContain('Welcome, Bill.');
  });

  it("leaves the household's details and the server status to Settings (BILLIAMVT-49)", async () => {
    const element = await render();
    expect(element.textContent).not.toContain('Server status');
    expect(element.querySelector('.invite')).toBeNull();
  });
});
