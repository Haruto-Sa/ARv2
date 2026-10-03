import { defineConfig, devices } from '@playwright/test';

// 4321はAstroのデフォルトでローカルに他のプロジェクトが使っていることがあるため、
// このリポジトリのE2E専用に別ポートを割り当てる。
const PORT = 4324;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // ヘッドレスChromeをworker 1つ(タブ1枚)だけで動かすと、requestAnimationFrame駆動の
  // 連続アニメーション(体験メニューのオートスクロール等)がcompositor側で極端に
  // 間引かれることがある(実機・複数タブ同時実行では発生しない)。最低2並列を確保する。
  workers: process.env.CI ? 2 : undefined,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // ASTRO_PREVIEW_BACKGROUND: astroはAIエージェント実行を検知すると自動で
    // バックグラウンドサーバーとして起動し、ビルドを更新しても古いプロセスが
    // 居座ってPlaywrightのwebServerライフサイクル管理から外れてしまう。
    // 非空文字を設定してその自動バックグラウンド化を止め、Playwright配下の
    // 通常プロセスとして起動・終了を管理させる。
    command: `npm run build && npx astro preview --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ASTRO_PREVIEW_BACKGROUND: '0' },
  },
});
