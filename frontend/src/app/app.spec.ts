import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { App } from './app';
import { User } from './auth/auth.models';
import { AuthService } from './auth/auth.service';

describe('App', () => {
  async function render(user: User | null) {
    const auth = { user: signal(user), logout: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return { auth, router, element: fixture.nativeElement as HTMLElement };
  }

  it('renders the app title', async () => {
    const { element } = await render(null);
    expect(element.querySelector('h1')?.textContent).toContain('Housework Scheduler');
  });

  it('hides the account bar when logged out', async () => {
    const { element } = await render(null);
    expect(element.textContent).not.toContain('Log out');
  });

  it('shows who is signed in and logs out', async () => {
    const { auth, router, element } = await render({ id: 2, email: 'bill@example.com', displayName: 'Bill' });
    expect(element.textContent).toContain('Signed in as Bill');

    element.querySelector<HTMLButtonElement>('header button')!.click();

    expect(auth.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
