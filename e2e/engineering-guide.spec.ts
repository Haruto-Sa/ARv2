import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('standalone guide works offline, switches slides and responds to keys', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.setOffline(true);
  await page.goto(pathToFileURL(resolve('public/docs/ar-engineering-guide.html')).href);
  await expect(page.locator('.chapter')).toHaveCount(15);
  await page.getByRole('button', { name: 'スライド表示' }).click();
  await expect(page.locator('.chapter:visible')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#overview')).toBeHidden();
  await page.locator('#chapter-select').selectOption('6');
  await page.locator('#tilt').fill('90');
  await expect(page.locator('#tilt-value')).toContainText('除外');
  await page.locator('#tilt').fill('0');
  await expect(page.locator('#tilt-value')).toContainText('採用');
  await page.getByRole('button', { name: '読み物表示' }).click();
  await expect(page.locator('.chapter:visible')).toHaveCount(15);
  expect(errors).toEqual([]);
});

test('guide is served under docs and the mobile layout fits the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto('/docs/ar-engineering-guide.html');
  expect(response?.ok()).toBe(true);
  await page.locator('#chapter-select').selectOption('8');
  await expect(page.getByRole('heading', { name: '同じ水門をQuick Lookで表示するための補正' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
