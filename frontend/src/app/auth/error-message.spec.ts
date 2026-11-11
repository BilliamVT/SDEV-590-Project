import { HttpErrorResponse } from '@angular/common/http';

import { errorMessage } from './error-message';

describe('errorMessage', () => {
  it("explains when the server can't be reached", () => {
    expect(errorMessage(new HttpErrorResponse({ status: 0 }))).toContain("couldn't be reached");
  });

  it("shows the server's explanation", () => {
    const error = new HttpErrorResponse({ status: 400, error: { detail: 'Choose a day of the week.' } });
    expect(errorMessage(error)).toBe('Choose a day of the week.');
  });

  it("hides Spring's generic validation message", () => {
    const error = new HttpErrorResponse({ status: 400, error: { detail: 'Invalid request content.' } });
    expect(errorMessage(error)).toBe('Please check the details you entered.');
  });

  it('falls back to a general message', () => {
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });
});
