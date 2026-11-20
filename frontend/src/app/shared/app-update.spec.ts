import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AppUpdate, mainScript } from './app-update';

describe('AppUpdate (BILLIAMVT-53)', () => {
  let update: AppUpdate;
  let reload: ReturnType<typeof vi.fn<() => void>>;
  let page: (html: string) => void;

  beforeEach(() => {
    const document = TestBed.inject(DOCUMENT);
    const script = document.createElement('script');
    script.setAttribute('src', 'main-OLD11111.js');
    script.setAttribute('type', 'module');
    document.body.appendChild(script);
    update = TestBed.inject(AppUpdate);
    reload = vi.fn<() => void>();
    update.reload = reload;
    page = (html) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(html));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.inject(DOCUMENT).querySelectorAll('script[src^="main-"], dialog, form').forEach((e) => e.remove());
  });

  it('finds the main script in a page', () => {
    expect(mainScript('<script src="polyfills-A.js"></script><script src="main-YVLR4WOF.js" type="module"></script>')).toBe(
      'main-YVLR4WOF.js',
    );
    expect(mainScript('<p>no scripts</p>')).toBeNull();
  });

  it('reloads when a newer version is deployed', async () => {
    page('<script src="main-NEW22222.js" type="module"></script>');

    expect(await update.check()).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(expect.any(String), { cache: 'no-store' });
  });

  it('stays when the version is the same, or the check fails', async () => {
    page('<script src="main-OLD11111.js" type="module"></script>');
    expect(await update.check()).toBe(false);

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    expect(await update.check()).toBe(false);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    expect(await update.check()).toBe(false);

    expect(reload).not.toHaveBeenCalled();
  });

  it("doesn't reload over an open action sheet or a changed form", async () => {
    const document = TestBed.inject(DOCUMENT);
    page('<script src="main-NEW22222.js" type="module"></script>');

    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);
    expect(await update.check()).toBe(false);
    dialog.remove();

    const form = document.createElement('form');
    form.className = 'ng-dirty';
    document.body.appendChild(form);
    expect(await update.check()).toBe(false);

    expect(reload).not.toHaveBeenCalled();
  });
});
