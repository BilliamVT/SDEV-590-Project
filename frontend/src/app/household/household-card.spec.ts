import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { signal } from '@angular/core';

import { AuthService } from '../auth/auth.service';

import { Household } from './household.models';
import { HouseholdCard } from './household-card';
import { HouseholdService } from './household.service';

const mine: Household = {
  id: 1,
  name: "Bill's household",
  timeZone: 'America/New_York',
  inviteCode: 'K7QM3XRP',
  members: [{ id: 2, displayName: 'Bill' }],
};
const theirs: Household = {
  id: 5,
  name: "Sam's household",
  timeZone: 'America/New_York',
  inviteCode: 'ABCD2345',
  members: [
    { id: 4, displayName: 'Sam' },
    { id: 2, displayName: 'Bill' },
  ],
};

describe('HouseholdCard', () => {
  async function render(join: () => Observable<Household> = () => of(theirs), current: Household | null = mine) {
    const households = {
      load: vi.fn(() => of(current)),
      create: vi.fn((name: string) => of({ ...mine, name })),
      join: vi.fn(join),
      regenerateInviteCode: vi.fn(() => of({ ...mine, inviteCode: 'NEWC0DE2' })),
    };
    await TestBed.configureTestingModule({
      imports: [HouseholdCard],
      providers: [
        { provide: HouseholdService, useValue: households },
        { provide: AuthService, useValue: { user: signal({ id: 2, email: 'bill@example.com', displayName: 'Bill' }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(HouseholdCard);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const click = async (text: string) => {
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!.click();
      await fixture.whenStable();
    };
    const typeCode = (value: string, id = 'invite-code') => {
      const input = element.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    return { element, households, click, typeCode };
  }

  it('shows the household, its members and the invite code', async () => {
    const { element } = await render();
    expect(element.textContent).toContain("Bill's household");
    expect(element.querySelector('li')?.textContent).toBe('Bill');
    expect(element.querySelector('code')?.textContent).toBe('K7QM-3XRP');
  });

  it('warns before leaving a household the user is the only member of, then joins', async () => {
    const { element, households, click, typeCode } = await render();
    typeCode('abcd-2345');
    await click('Join');

    expect(households.join).not.toHaveBeenCalled();
    expect(element.textContent).toContain('it will be deleted along with its tasks');

    await click('Leave and join');
    expect(households.join).toHaveBeenCalledWith('abcd-2345');
    expect(element.textContent).toContain("Sam's household");
    expect(element.querySelectorAll('li')).toHaveLength(2);
  });

  it('cancelling does not join', async () => {
    const { households, click, typeCode } = await render();
    typeCode('abcd-2345');
    await click('Join');
    await click('Cancel');
    expect(households.join).not.toHaveBeenCalled();
  });

  it('asks for a code before confirming', async () => {
    const { element, click } = await render();
    await click('Join');
    expect(element.textContent).toContain('Enter an invite code.');
  });

  it('shows the error for an unknown code', async () => {
    const notFound = new HttpErrorResponse({ status: 404, error: { detail: 'No household has that invite code' } });
    const { element, click, typeCode } = await render(() => throwError(() => notFound));
    typeCode('zzzz-zzzz');
    await click('Join');
    await click('Leave and join');
    expect(element.textContent).toContain('No household has that invite code');
    expect(element.textContent).toContain("Bill's household");
  });

  it('replaces the invite code', async () => {
    const { element, click } = await render();
    await click('New code');
    expect(element.querySelector('code')?.textContent).toBe('NEWC-0DE2');
  });

  describe('without a household', () => {
    it('offers to create one, named after the user, or to join one', async () => {
      const { element } = await render(undefined, null);
      expect(element.textContent).toContain('Set up your household');
      expect(element.querySelector<HTMLInputElement>('#household-name')?.value).toBe("Bill's household");
      expect(element.querySelector('#setup-invite-code')).not.toBeNull();
    });

    it('creates the household and then shows it', async () => {
      const { element, households, click, typeCode } = await render(undefined, null);
      typeCode('The Flat', 'household-name');
      await click('Create household');

      expect(households.create).toHaveBeenCalledWith('The Flat');
      expect(element.textContent).not.toContain('Set up your household');
      expect(element.querySelector('.name')?.textContent).toBe('The Flat');
    });

    it('joins straight away, with no warning since there is nothing to leave', async () => {
      const { element, households, click, typeCode } = await render(undefined, null);
      typeCode('abcd-2345', 'setup-invite-code');
      await click('Join household');

      expect(households.join).toHaveBeenCalledWith('abcd-2345');
      expect(element.textContent).toContain("Sam's household");
    });

    it('asks for a name', async () => {
      const { element, households, click, typeCode } = await render(undefined, null);
      typeCode('', 'household-name');
      await click('Create household');

      expect(households.create).not.toHaveBeenCalled();
      expect(element.textContent).toContain('Enter a name for your household.');
    });
  });
});
