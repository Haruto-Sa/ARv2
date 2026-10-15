import { test, expect, type Page } from '@playwright/test';
async function fakeUnity(page:Page){
 await page.route('**/Build/*.loader.js',route=>route.fulfill({contentType:'application/javascript',body:`window.messages=[];window.createUnityInstance=async()=>({SendMessage:(...args)=>{window.messages.push(args);if(args[1]==='StartGame'||args[1]==='ResetGame')window.dispatchEvent(new CustomEvent('unity-state',{detail:{type:'state',state:args[1]==='StartGame'?'Running':'Idle',B:0,h:0}}))}});`}));
}
async function completeGuide(page:Page){await page.locator('[data-guide-next]').click();await page.locator('[data-guide-next]').click();await page.locator('#start-experience').click();}
test('onboarding blocks engine loading, persists, and can be reopened', async ({page})=>{
 await fakeUnity(page); await page.goto('/unity/');
 await expect(page.locator('#onboarding')).toBeVisible(); await expect(page.locator('#unity-loading')).toBeHidden();
 expect(await page.locator('script[src*="Build/"]').count()).toBe(0);
 await page.locator('[data-guide-next]').click(); await page.locator('[data-guide-back]').click();
 await expect(page.locator('[data-guide-step]').first()).toBeVisible();
 await completeGuide(page); await expect(page.locator('#controls')).toBeVisible();
 await page.reload(); await expect(page.locator('#controls')).toBeVisible(); await expect(page.locator('#onboarding')).toBeHidden();
 await page.locator('#help').click(); await expect(page.locator('#onboarding')).toBeVisible();
 await page.keyboard.press('Escape'); await expect(page.locator('#onboarding')).toBeHidden();
 await expect(page.locator('#home-link')).toHaveAttribute('href','../');
});
test('buttons send the expected simulation commands',async({page})=>{
 await fakeUnity(page); await page.goto('/unity/'); await completeGuide(page); await expect(page.locator('#controls')).toBeVisible();
 await page.locator('#unity-settings summary').click(); await page.locator('#place-default').click();
 await page.locator('#start').click(); await expect(page.locator('#start')).toBeDisabled();
 await page.locator('#camera').click(); await page.locator('#end').click();
 expect(await page.evaluate(()=>(window as any).messages.map((m:any[])=>m[1]))).toEqual(['PlaceAtDefaultPosition','StartGame','NextCamera','ResetGame']);
 await expect(page.locator('#start')).toBeEnabled();
});
