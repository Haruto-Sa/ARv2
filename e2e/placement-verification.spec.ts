import { test, expect } from '@playwright/test';
test.setTimeout(60000);

test('verification is opt-in and survives PC fallback', async ({page})=>{
 await page.goto('/viewer');await expect(page.locator('#verification-open')).toBeHidden();
 await page.goto('/ar/place/?verify=1');await expect(page).toHaveURL(/\/viewer\/?\?verify=1$/);
 await expect(page.locator('#status')).toHaveText('水門を回して見てみましょう。',{timeout:30000});
 await page.locator('#verification-open').click();
 const report=JSON.parse(await page.locator('#verification-report').inputValue());
 expect(report.build.schemaVersion).toBe(1);
 expect(report.route).toBe('viewer');expect(report.placed).toBe(false);
 expect(report.modelReferenceDimensionsMeters.width).toBeCloseTo(0.2);
 expect(report.placedPositionMeters).toBe(null);
 await page.locator('#placement-reference').check();
 const downloadPromise=page.waitForEvent('download');await page.locator('#verification-download').click();
 const download=await downloadPromise;expect(download.suggestedFilename()).toMatch(/^placement-check-.*\.json$/);
 await page.locator('#verification-close').click();
 await page.locator('#adjustments summary').click();await page.locator('#width').fill('0.4');
 await page.locator('#verification-open').click();
 expect(JSON.parse(await page.locator('#verification-report').inputValue()).modelReferenceDimensionsMeters.width).toBeCloseTo(0.4);
});

test('AR help belongs to the overlay and only UI taps block XR selection',async({page})=>{
 await page.goto('/viewer');await expect(page.locator('#status')).toHaveText('水門を回して見てみましょう。',{timeout:30000});
 expect(await page.locator('#overlay').evaluate(el=>el.contains(document.querySelector('#placement-guide')))).toBe(true);
 const cancel=()=>page.evaluate(()=>{
  const background=new Event('beforexrselect',{bubbles:true,cancelable:true});
  const button=new Event('beforexrselect',{bubbles:true,cancelable:true});
  document.querySelector('#overlay')!.dispatchEvent(background);document.querySelector('#help')!.dispatchEvent(button);
  return {background:background.defaultPrevented,button:button.defaultPrevented};
 });
 expect(await cancel()).toEqual({background:false,button:true});
 await page.locator('#help').click();expect((await cancel()).background).toBe(true);
 await page.locator('[data-guide-next]').click(); await page.locator('[data-guide-next]').click();await page.locator('[data-guide-done]').click();
 await expect(page.locator('#placement-guide')).toBeHidden();
});

test.describe('native placement verification',()=>{
 test.use({isMobile:true,hasTouch:true,viewport:{width:390,height:844}});
 test('Quick Look reports unobservable placement instead of a false failure',async({page})=>{
  await page.addInitScript(()=>{const original=DOMTokenList.prototype.supports;DOMTokenList.prototype.supports=function(token){return token==='ar'||original.call(this,token)};});
  await page.goto('/ar/place/?verify=1');
  await page.locator('#placement-guide').waitFor();
  await page.locator('[data-guide-next]').click();await page.locator('[data-guide-next]').click();await page.locator('[data-guide-done]').click();
  await expect(page.locator('#quicklook')).toBeVisible({timeout:60000});
  await page.locator('#verification-open').click();
  const report=JSON.parse(await page.locator('#verification-report').inputValue());
  expect(report.route).toBe('quick-look');expect(report.placed).toBe(null);
  expect(report.tracking).toBe('native-unobservable');expect(report.placedPositionMeters).toBe(null);
  expect(report.modelReferenceDimensionsMeters.width).toBeCloseTo(0.2);
 });
});
