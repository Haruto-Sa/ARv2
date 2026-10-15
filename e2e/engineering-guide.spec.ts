import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
test('guide works offline and explains each page separately', async ({ page, context }) => {
 const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
 await context.setOffline(true);
 await page.goto(pathToFileURL(resolve('public/docs/ar-engineering-guide.html')).href);
 await expect(page.locator('.page')).toHaveCount(6);
 await expect(page.locator('.page:visible')).toHaveCount(1);
 await page.locator('nav a[href="#ar"]').click();
 await expect(page.locator('#ar')).toBeVisible();
 await expect(page.locator('#ar img')).toBeVisible();
 expect(await page.locator('#ar img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 await page.goBack(); await expect(page.locator('#intro')).toBeVisible();
 expect(errors).toEqual([]);
});
test('mobile guide fits the screen', async ({ page }) => {
 await page.setViewportSize({width:390,height:844}); await page.goto('/docs/ar-engineering-guide.html#unity');
 await expect(page.locator('#unity')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
