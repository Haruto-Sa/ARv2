import { test, expect } from '@playwright/test';
test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });

test('PC goes straight to the watergate viewer even when rel=ar is supported', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 });
    const original = DOMTokenList.prototype.supports;
    DOMTokenList.prototype.supports = function(token) { return token === 'ar' || original.call(this, token); };
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/ar/place');
  await expect(page).toHaveURL(/\/viewer\/?$/);
  await expect(page.locator('#status')).toHaveText('水門を回して見てみましょう。', { timeout: 30_000 });
  await page.getByRole('button', { name: '扉の動きを一時停止' }).click();
  await expect(page.getByRole('button', { name: '扉の動きを再生' })).toBeVisible();
  await page.locator('#width').fill('0.4');
  await expect(page.locator('#width-value')).toHaveText('40cm');
  expect(errors).toEqual([]);
});

test('Quick Look prepares a USDZ from the actual mirrored watergate meshes', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const original = DOMTokenList.prototype.supports;
    DOMTokenList.prototype.supports = function(token) { return token === 'ar' || original.call(this, token); };
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.text().includes('USDZExporter:')) errors.push(message.text());
  });
  await page.goto('/ar/place');
  await expect(page.locator('#camera-notice')).toBeVisible();
  await expect(page.locator('#viewport')).toBeHidden();
  await expect(page.locator('#model-controls')).toBeHidden();
  await expect(page.locator('#quicklook')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('link', { name: 'カメラを起動', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'ホームに戻る' })).toBeVisible();
  const packageInfo = await page.locator('#quicklook').evaluate(async (link: HTMLAnchorElement) => {
    const response = await fetch(link.href);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { type: response.headers.get('content-type'), size: bytes.length, signature: Array.from(bytes.slice(0, 4)) };
  });
  expect(packageInfo.type).toBe('model/vnd.usdz+zip');
  expect(packageInfo.size).toBeGreaterThan(100_000);
  expect(packageInfo.signature).toEqual([80, 75, 3, 4]);
  expect(errors).toEqual([]);
});

test('mobile camera denial allows retry or viewer fallback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'xr', { configurable: true, value: {
      isSessionSupported: async () => true,
      requestSession: async () => { throw new DOMException('Denied', 'NotAllowedError'); },
      addEventListener: () => {}, removeEventListener: () => {},
    } });
  });
  await page.goto('/ar/place');
  const start = page.getByRole('button', { name: 'カメラを起動', exact: true });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  await expect(page.locator('#status')).toContainText('カメラ・ARの許可が必要');
  await expect(start).toBeEnabled();
  await expect(page.locator('#model-controls')).toBeHidden();
  await page.getByRole('link', { name: '3Dビューアで見る' }).click();
  await expect(page).toHaveURL(/\/viewer\/?$/);
});

test('unsupported smartphone is redirected to the viewer', async ({ page }) => {
  await page.goto('/ar/place');
  await expect(page).toHaveURL(/\/viewer\/?$/);
  await expect(page.locator('#status')).toHaveText('水門を回して見てみましょう。', { timeout: 30_000 });
  await page.getByRole('link', { name: 'ホームに戻る' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('viewer works independently of AR support', async ({ page }) => {
  await page.goto('/viewer');
  await expect(page.locator('#status')).toHaveText('水門を回して見てみましょう。', { timeout: 30_000 });
  await expect(page.locator('#viewport canvas')).toBeVisible();
  await expect(page.locator('#start-ar')).toBeHidden();
});
