import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import base from '../../playwright.config';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const server = base.webServer;
if (!server || Array.isArray(server)) throw new Error('Comparison requires one preview server');

// This opt-in project deliberately uses real models for ALL original placement cases.
// Keep --workers and --repeat-each identical when comparing revisions.
export default defineConfig({
  ...base,
  testDir: process.env.COMPARISON_TEST_DIR ?? path.join(root, 'e2e'),
  testMatch: ['placement.spec.ts', 'placement-verification.spec.ts', 'ui-layout.spec.ts'],
  outputDir: path.join(root, 'test-results'),
  projects: [{ name: 'comparison', use: { ...devices['Desktop Chrome'] } }],
  webServer: { ...server, cwd: root },
});
