import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const base = process.env.SCREENSHOT_URL || 'http://127.0.0.1:4330';
const output = 'public/docs/screenshots';
await mkdir(output, { recursive: true });
let browser = await chromium.launch();
try {
 const desktop = await browser.newContext({viewport:{width:1280,height:900}});
 const page = await desktop.newPage();
 await page.goto(base+'/'); await page.locator('.leaflet-tile-loaded').first().waitFor({timeout:30000}); await page.screenshot({path:output+'/landing-desktop.png',fullPage:true});
 await page.goto(base+'/viewer'); await page.locator('#status').filter({hasText:'水門を回して'}).waitFor({timeout:60000});
 await page.screenshot({path:output+'/viewer-desktop.png'});
 await page.goto(base+'/unity/index.html'); await page.locator('#onboarding').waitFor();
 await page.screenshot({path:output+'/unity-onboarding.png'});
 await page.locator('[data-guide-next]').click(); await page.locator('[data-guide-next]').click(); await page.locator('#start-experience').click();
 await page.locator('#controls').waitFor({timeout:120000});
 // Unity resolves its instance before the splash animation and scene startup finish.
 await page.waitForTimeout(8000);
 await page.locator('#unity-settings').evaluate(el=>el.open=true);
 await page.locator('#place-default').click(); await page.locator('#unity-settings').evaluate(el=>el.open=false);
 await page.screenshot({path:output+'/unity-desktop.png'});
 await desktop.close();
 await browser.close();
 browser=await chromium.launch();
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await mobile.addInitScript(()=>{const original=DOMTokenList.prototype.supports;DOMTokenList.prototype.supports=function(token){return token==='ar'||original.call(this,token)}});
 const phone=await mobile.newPage(); await phone.goto(base+'/ar/place');
 await phone.locator('#placement-guide').waitFor(); await phone.screenshot({path:output+'/plane-onboarding-mobile.png'});
 await phone.locator('[data-guide-next]').click(); await phone.locator('[data-guide-next]').click(); await phone.locator('[data-guide-done]').click();
 await phone.locator('#quicklook').waitFor({timeout:90000}); await phone.screenshot({path:output+'/plane-start-mobile.png'});
 console.log('Saved six screenshots to '+output);
} finally {await browser.close()}
