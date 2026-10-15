import { test, expect } from './fixtures/placement';
for (const size of [{width:320,height:568},{width:844,height:390}]) {
 test(`experience navigation fits ${size.width}x${size.height}`,async({page})=>{
  await page.setViewportSize(size);
  await page.goto('/viewer');
  await expect(page.locator('#status')).toHaveText('水門を回して見てみましょう。',{timeout:30000});
  for (const id of ['home','help','animation']) {
   const rect=(await page.locator('#'+id).boundingBox())!;
   expect(rect.width).toBeGreaterThanOrEqual(44); expect(rect.height).toBeGreaterThanOrEqual(44);
   expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(size.width);
   expect(rect.y+rect.height).toBeLessThanOrEqual(size.height);
  }
  await page.locator('#help').click(); await expect(page.locator('#placement-guide')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.keyboard.press('Escape');await expect(page.locator('#placement-guide')).toBeHidden();
  await expect(page.locator('#help')).toBeFocused();
 });
}
