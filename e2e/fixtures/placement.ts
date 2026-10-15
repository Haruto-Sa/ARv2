import { test as base, expect } from '@playwright/test';
import { uiModel } from './model';

/** UI tests replace only GLB bytes at the network boundary; WebGL integration uses the real model. */
export const test = base.extend({
  page: async ({ page }, runTest, testInfo) => {
    if (testInfo.project.name === 'ui') {
      await page.route('**/models/suimon-kousin.glb', route => route.fulfill({ contentType: 'model/gltf-binary', body: uiModel() }));
    }
    let crashed = false;
    page.on('crash', () => { crashed = true; });
    await runTest(page);
    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('browser-lifecycle', { body: JSON.stringify({ crashed }), contentType: 'application/json' });
    }
  },
});
export { expect };
