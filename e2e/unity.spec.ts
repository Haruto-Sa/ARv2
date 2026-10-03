import { test, expect } from '@playwright/test';

test.describe('Unity experience onboarding', () => {
  test('shows onboarding on first visit and blocks Unity loading until dismissed', async ({ page }) => {
    await page.goto('/unity/');

    const onboarding = page.locator('#onboarding');
    await expect(onboarding).not.toHaveClass(/hidden/);
    await expect(page.locator('#unity-loading')).toBeHidden();

    await page.locator('#start-experience').click();
    await expect(onboarding).toHaveClass(/hidden/);
    await expect(page.locator('#unity-loading')).toBeVisible();
  });

  test('skips onboarding and auto-loads on a repeat visit', async ({ page }) => {
    await page.goto('/unity/');
    await page.locator('#start-experience').click();
    await expect(page.locator('#onboarding')).toHaveClass(/hidden/);

    await page.reload();
    await expect(page.locator('#onboarding')).toHaveClass(/hidden/);
    await expect(page.locator('#unity-loading')).toBeVisible();
  });

  test('home link returns to the top page regardless of deploy base', async ({ page }) => {
    await page.goto('/unity/');
    await expect(page.locator('#home-link')).toHaveAttribute('href', '../');
  });
});
