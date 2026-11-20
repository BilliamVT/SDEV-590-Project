import { APIRequestContext, Page, expect } from '@playwright/test';

/**
 * The app can be added to a home screen (BILLIAMVT-53): the page links a manifest that says to
 * open full screen, and every icon it names, plus the iPhone one, loads as a PNG of its size.
 * Paths are resolved from the page, so this also proves they're right under GitHub Pages'
 * /SDEV-590-Project/. Used by the e2e tests and the post-deploy smoke test.
 */
export async function expectInstallable(page: Page, request: APIRequestContext): Promise<void> {
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref, 'the page links a manifest').toBeTruthy();
  const manifestUrl = new URL(manifestHref!, page.url());
  const response = await request.get(manifestUrl.href);
  expect(response.ok(), `${manifestUrl} loads`).toBe(true);
  const manifest = await response.json();

  expect(manifest).toMatchObject({ name: 'Housework Scheduler', short_name: 'Housework', display: 'standalone' });
  // The start page is inside the app, so it opens the app and not a 404
  expect(new URL(manifest.start_url, manifestUrl).href).toBe(new URL('./', manifestUrl).href);
  const purposes = manifest.icons.map((icon: { purpose?: string }) => icon.purpose ?? 'any');
  expect(purposes).toContain('maskable');
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );

  const appleHref = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  const icons = [
    ...manifest.icons.map((icon: { src: string; sizes: string }) => ({
      url: new URL(icon.src, manifestUrl).href,
      size: Number(icon.sizes.split('x')[0]),
    })),
    { url: new URL(appleHref!, page.url()).href, size: 180 },
  ];
  for (const { url, size } of icons) {
    const icon = await request.get(url);
    expect(icon.ok(), `${url} loads`).toBe(true);
    expect(icon.headers()['content-type']).toContain('image/png');
    // A PNG's width and height are bytes 16–23
    const png = await icon.body();
    expect([png.readUInt32BE(16), png.readUInt32BE(20)], `${url} is ${size}px`).toEqual([size, size]);
  }
}
