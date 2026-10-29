import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { Register } from './register';

describe('Register', () => {
  async function render(register: () => Observable<unknown>) {
    const auth = { register: vi.fn(register) };
    await TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Register);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const type = (id: string, value: string) => {
      const input = element.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const submit = async () => {
      element.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };
    return { auth, router, element, type, submit };
  }

  it('requires a password of at least 8 characters', async () => {
    const { auth, element, type, submit } = await render(() => of({}));
    type('displayName', 'Bill');
    type('email', 'bill@example.com');
    type('password', 'short');
    await submit();
    expect(auth.register).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Use 8 to 72 characters');
  });

  it('does not show field errors while typing, so the page does not shift', async () => {
    const { element, type } = await render(() => of({}));
    type('password', 'short');
    element.querySelector<HTMLInputElement>('#password')!.dispatchEvent(new Event('blur'));
    expect(element.textContent).not.toContain('Use 8 to 72 characters');
  });

  it('creates the account and goes home', async () => {
    const { auth, router, type, submit } = await render(() => of({}));
    type('displayName', 'Bill');
    type('email', 'bill@example.com');
    type('password', 'correct-horse');
    await submit();
    expect(auth.register).toHaveBeenCalledWith({
      displayName: 'Bill',
      email: 'bill@example.com',
      password: 'correct-horse',
    });
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('shows when the email is already registered', async () => {
    const failure = new HttpErrorResponse({ status: 409, error: { detail: 'An account with this email already exists' } });
    const { element, type, submit } = await render(() => throwError(() => failure));
    type('displayName', 'Bill');
    type('email', 'bill@example.com');
    type('password', 'correct-horse');
    await submit();
    expect(element.querySelector('[role=alert]')?.textContent).toContain('already exists');
  });
});
