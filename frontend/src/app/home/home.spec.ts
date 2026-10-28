import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, of, throwError } from 'rxjs';

import { HealthService } from '../health/health.service';
import { Home } from './home';

describe('Home', () => {
  async function render(status: Observable<string>): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [{ provide: HealthService, useValue: { status: () => status } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

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
