import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { Login } from './login';

describe('Login', () => {
  async function render(login: () => Observable<unknown>, queryParams: Record<string, string> = {}) {
    const auth = { login: vi.fn(login) };
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
      ],
    }).compileComponents();
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Login);
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

  it('confirms when the user arrives after deleting their account', async () => {
    const { element } = await render(() => of({}), { deleted: '1' });
    expect(element.textContent).toContain('Your account has been deleted.');
  });

  it('shows no notice on a normal visit', async () => {
    const { element } = await render(() => of({}));
    expect(element.textContent).not.toContain('deleted');
  });

  it('does not call the server when the form is invalid', async () => {
    const { auth, element, submit } = await render(() => of({}));
    await submit();
    expect(auth.login).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Enter a valid email address');
  });

  it('does not show field errors while typing, so the page does not shift', async () => {
    const { element, type } = await render(() => of({}));
    type('email', 'test');
    element.querySelector<HTMLInputElement>('#email')!.dispatchEvent(new Event('blur'));
    expect(element.textContent).not.toContain('Enter a valid email address');
  });

  it('logs in and goes home', async () => {
    const { auth, router, type, submit } = await render(() => of({}));
    type('email', 'bill@example.com');
    type('password', 'correct-horse');
    await submit();
    expect(auth.login).toHaveBeenCalledWith({ email: 'bill@example.com', password: 'correct-horse' });
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it("shows the server's message when login fails", async () => {
    const failure = new HttpErrorResponse({ status: 401, error: { detail: 'Invalid email or password' } });
    const { element, type, submit } = await render(() => throwError(() => failure));
    type('email', 'bill@example.com');
    type('password', 'wrong');
    await submit();
    expect(element.querySelector('[role=alert]')?.textContent).toContain('Invalid email or password');
  });
});
