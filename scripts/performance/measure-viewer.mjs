import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// Local, opt-in measurements. No camera, location, auth, or network telemetry is collected.
const url = process.env.VIEWER_URL ?? 'http://localhost:4324/viewer';
const output = process.env.MEASUREMENT_OUTPUT ?? '/tmp/arv2-viewer-measurement.json';
const cpuRate = Number(process.env.CPU_RATE ?? 1);
const repeats = Number(process.env.MEASUREMENT_REPEATS ?? 3);
if (![1, 4].includes(cpuRate) || !Number.isInteger(repeats) || repeats < 1 || repeats > 5) throw new Error('Use CPU_RATE=1|4 and MEASUREMENT_REPEATS=1..5');
const browser = await chromium.launch();
const results = [];
const watchdog = setTimeout(() => { void browser.close(); }, 10 * 60_000);
try {
  for (let run = 0; run < repeats; run++) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(30_000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    let crashed = false;
    page.on('crash', () => { crashed = true; });
    await page.addInitScript(() => {
      const state = { rafCalls: 0, rafCpuMs: 0, maxRafCpuMs: 0, drawCalls: 0, drawCpuMs: 0, longTasks: 0, longTaskMs: 0 };
      window.__viewerProbe = state;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => raf(time => {
        const start = performance.now();
        try { callback(time); } finally {
          const elapsed = performance.now() - start;
          state.rafCalls++; state.rafCpuMs += elapsed; state.maxRafCpuMs = Math.max(state.maxRafCpuMs, elapsed);
        }
      });
      for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        for (const name of ['drawArrays', 'drawElements']) {
          const original = prototype[name];
          prototype[name] = function (...args) {
            const start = performance.now();
            try { return original.apply(this, args); } finally { state.drawCalls++; state.drawCpuMs += performance.now() - start; }
          };
        }
      }
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.startTime < (state.windowStart ?? Infinity)) continue;
          state.longTasks++; state.longTaskMs += entry.duration;
        }
      }).observe({ type: 'longtask', buffered: true });
    });
    const phases = {};
    const actions = {};
    /** Sample a fixed measurement window after readiness assertions; never used to make an assertion pass. */
    async function sample(name) {
      phases[name] = await page.evaluate(async () => {
        for (const key of Object.keys(window.__viewerProbe)) window.__viewerProbe[key] = 0;
        const start = performance.now();
        window.__viewerProbe.windowStart = start;
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { ...window.__viewerProbe, durationMs: performance.now() - start };
      });
    }
    /** Measure a real Playwright action including actionability and browser response time. */
    async function action(name, operation) {
      const start = performance.now(); await operation(); actions[name] = performance.now() - start;
    }
    try {
      await action('modelReady', async () => {
        await page.goto(url);
        await expect(page.locator('#status')).toHaveText('水門を回して見てみましょう。');
        await expect(page.locator('#viewport canvas')).toBeVisible();
      });
      await sample('playing');
      await action('pause', () => page.locator('#animation').click());
      await expect(page.locator('#animation')).toHaveText('扉の動きを再生');
      await sample('paused');
      await action('resizeAndRotate', async () => {
        await page.locator('#adjustments summary').click();
        await page.locator('#width').fill('0.4');
        await page.locator('#rotation').fill('45');
        await expect(page.locator('#width-value')).toHaveText('40cm');
      });
      await action('openGuide', () => page.locator('#help').click());
      await expect(page.locator('#placement-guide')).toBeVisible();
      await sample('guide');
      await action('closeGuide', () => page.keyboard.press('Escape'));
      await expect(page.locator('#help')).toBeFocused();
      await action('resume', () => page.locator('#animation').click());
      await sample('resumed');
      results.push({ run, phases, actions, crashed });
    } catch (error) {
      results.push({ run, phases, actions, crashed, error: String(error) });
    } finally { await page.close(); }
  }
} finally { clearTimeout(watchdog); await browser.close(); }
await writeFile(output, JSON.stringify({ node: process.version, platform: process.platform, cpuRate, viewport: '390x844@1', results }, null, 2));
console.log(output);
if (results.some(result => result.error)) process.exitCode = 1;
