import { defineConfig, devices } from '@playwright/test';

// 4321はAstroのデフォルトでローカルに他のプロジェクトが使っていることがあるため、
// このリポジトリのE2E専用に別ポートを割り当てる。
const PORT = 4324;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  globalTimeout: 10 * 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'ui', grepInvert: /@webgl/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'webgl', grep: /@webgl/, workers: 1,
      use: {
        ...devices['Desktop Chrome'],
        // A trace filmstrip repeatedly reads back the software-rendered GPU canvas.
        // Keep actions/DOM/source traces and the separate failure screenshot, without that observer load.
        trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: true },
      },
    },
  ],
  webServer: {
    // ASTRO_PREVIEW_BACKGROUND: astroはAIエージェント実行を検知すると自動で
    // バックグラウンドサーバーとして起動し、ビルドを更新しても古いプロセスが
    // 居座ってPlaywrightのwebServerライフサイクル管理から外れてしまう。
    // 非空文字を設定してその自動バックグラウンド化を止め、Playwright配下の
    // 通常プロセスとして起動・終了を管理させる。
    command: `npm run build && npx astro preview --ignore-lock --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    // INCLUDE_LAB=1: E2Eスイートは /lab/* ページ(比較ランチャー等)も検証するため、
    // 本番ビルドの既定(除外)ではなくプレビュー/検証ビルド相当にする。
    env: { ASTRO_PREVIEW_BACKGROUND: '0', INCLUDE_LAB: '1' },
  },
});
