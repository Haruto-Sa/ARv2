import { test, expect } from './fixtures/placement';

for (const rate of [1, 4]) {
  test(`real viewer invalidation and modal lifecycle at CPU ${rate}x @webgl`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await page.addInitScript(() => {
      const probe = { draws: 0 };
      Object.assign(window, { viewerDraws: probe });
      for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        const original = prototype.drawElements;
        prototype.drawElements = function (...args) { probe.draws++; return original.apply(this, args); };
      }
    });
    const draws = () => page.evaluate(() => (window as unknown as { viewerDraws: { draws: number } }).viewerDraws.draws);
    // This observation window asserts quiescence, rather than delaying an action to make it pass.
    const idle = () => expect.poll(() => page.evaluate(async () => {
      const probe = (window as unknown as { viewerDraws: { draws: number } }).viewerDraws;
      const before = probe.draws;
      await new Promise(resolve => setTimeout(resolve, 300));
      return probe.draws - before;
    })).toBe(0);
    await page.goto('/viewer');
    await expect(page.locator('#status')).toHaveText('水門を回して見てみましょう。');
    await expect.poll(draws).toBeGreaterThan(0);
    await page.locator('#animation').click();
    await expect(page.locator('#animation')).toHaveText('扉の動きを再生');
    await idle();
    await page.locator('#adjustments summary').click();
    let before = await draws();
    await page.locator('#width').fill('0.4');
    await expect(page.locator('#width-value')).toHaveText('40cm');
    await expect.poll(draws).toBeGreaterThan(before);
    await idle();
    before = await draws();
    await page.locator('#rotation').fill('45');
    await expect.poll(draws).toBeGreaterThan(before);
    await idle();
    const canvas = page.locator('#viewport canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    before = await draws();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 50, box!.y + box!.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect.poll(draws).toBeGreaterThan(before);
    await idle();
    await page.locator('#animation').click();
    before = await draws();
    await expect.poll(draws).toBeGreaterThan(before);
    await page.locator('#help').click();
    await expect(page.locator('#placement-guide')).toBeVisible();
    await idle();
    before = await draws();
    await page.keyboard.press('Escape');
    await expect(page.locator('#help')).toBeFocused();
    await expect.poll(draws).toBeGreaterThan(before);
    // Synthetic lifecycle events validate the handler; actual device BFCache is a manual check.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await idle();
    before = await draws();
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect.poll(draws).toBeGreaterThan(before);
  });
}
