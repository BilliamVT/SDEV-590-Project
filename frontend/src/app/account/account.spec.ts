import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { Household } from '../household/household.models';
import { HouseholdService } from '../household/household.service';
import { Account } from './account';

const household = (memberCount: number): Household => ({
  id: 1,
  name: '433 Flynn Ave',
  timeZone: 'America/New_York',
  inviteCode: 'K7QM3XRP',
  members: Array.from({ length: memberCount }, (_, i) => ({ id: i + 1, displayName: `Member ${i + 1}` })),
});

describe('Account', () => {
  async function render(current: Household | null, deleteAccount: () => Observable<void> = () => of(undefined)) {
    const auth = {
      user: signal({ id: 2, email: 'bill@example.com', displayName: 'Bill' }),
      deleteAccount: vi.fn(deleteAccount),
    };
    await TestBed.configureTestingModule({
      imports: [Account],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: HouseholdService, useValue: { load: () => of(current) } },
      ],
    }).compileComponents();
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Account);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const click = async (text: string) => {
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!.click();
      await fixture.whenStable();
    };
    const typePassword = (value: string) => {
      const input = element.querySelector<HTMLInputElement>('#delete-password')!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    return { auth, router, element, click, typePassword };
  }

  it("shows the user's name and email", async () => {
    const { element } = await render(household(1));
    expect(element.textContent).toContain('Bill');
    expect(element.textContent).toContain('bill@example.com');
  });

  it('asks for confirmation before deleting', async () => {
    const { auth, element, click } = await render(household(1));
    expect(element.querySelector('#delete-password')).toBeNull();

    await click('Delete my account…');

    expect(element.querySelector('#delete-password')).not.toBeNull();
    expect(auth.deleteAccount).not.toHaveBeenCalled();
  });

  it('warns that the household goes too when the user is its only member', async () => {
    const { element, click } = await render(household(1));
    await click('Delete my account…');
    expect(element.textContent).toContain('433 Flynn Ave, so it and all its tasks will be deleted too');
  });

  it('explains that other members keep the household', async () => {
    const { element, click } = await render(household(2));
    await click('Delete my account…');
    expect(element.textContent).toContain("You'll be removed from 433 Flynn Ave");
    expect(element.textContent).toContain('keep its tasks and history');
  });

  it('requires the password', async () => {
    const { auth, element, click } = await render(household(1));
    await click('Delete my account…');
    await click('Permanently delete my account');
    expect(auth.deleteAccount).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Enter your password to confirm.');
  });

  it('deletes the account and goes to the login page with a notice', async () => {
    const { auth, router, click, typePassword } = await render(household(1));
    await click('Delete my account…');
    typePassword('correct-horse');
    await click('Permanently delete my account');

    expect(auth.deleteAccount).toHaveBeenCalledWith('correct-horse');
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { deleted: 1 } });
  });

  it('shows the error for a wrong password and stays on the page', async () => {
    const forbidden = new HttpErrorResponse({ status: 403, error: { detail: 'Password is incorrect' } });
    const { router, element, click, typePassword } = await render(household(1), () => throwError(() => forbidden));
    await click('Delete my account…');
    typePassword('wrong');
    await click('Permanently delete my account');

    expect(element.textContent).toContain('Password is incorrect');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('cancelling closes the confirmation', async () => {
    const { auth, element, click } = await render(household(1));
    await click('Delete my account…');
    await click('Cancel');
    expect(element.querySelector('#delete-password')).toBeNull();
    expect(auth.deleteAccount).not.toHaveBeenCalled();
  });
});
