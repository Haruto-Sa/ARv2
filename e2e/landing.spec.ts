import { test, expect } from '@playwright/test';
test('fixed experience cards link to available pages', async ({ page }) => {
 await page.goto('/');
 await expect(page.locator('.menu-card')).toHaveCount(3);
 for (const href of ['/ar/place', '/viewer', '/unity/']) await expect(page.locator(`.menu-card a[href="${href}"]`)).toBeVisible();
 await expect(page.locator('a[href*="/lab/"]')).toHaveCount(0);
});
test('mobile menu fits the viewport and has usable buttons', async ({ page }) => {
 await page.setViewportSize({width:390,height:844}); await page.goto('/');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const button of await page.locator('.menu-card a').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
