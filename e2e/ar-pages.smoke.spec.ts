import { test, expect } from '@playwright/test';

/**
 * 各ARページは getUserMedia/位置情報の実機許可が要るため、ここでは「導入画面が
 * エラーなくマウントされるか」だけを軽く検証する。開始ボタンの文言はエンジンごとに
 * 異なる(「ARを開始」「開始する」等、多段階フローもある)ため、文言には依存しない。
 */
const arPages = ['/ar/locar', '/ar/arjs', '/ar/deviceorientation', '/ar/marker'];

for (const path of arPages) {
  test(`${path} loads its intro UI with no console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    const response = await page.goto(path);
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole('button').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('/lab/compare links to all three location-AR patterns', async ({ page }) => {
  await page.goto('/lab/compare');
  await expect(page.locator('a[href="/ar/locar"]')).toBeVisible();
  await expect(page.locator('a[href="/ar/arjs"]')).toBeVisible();
  await expect(page.locator('a[href="/ar/deviceorientation"]')).toBeVisible();
});
