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
  // @webgl: real-model/real-GPU tests that are slow and must not share a renderer
  // concurrently; everything else (UI project) mocks the GLB fetch and can run in parallel.
  // @touch: タッチ操作の遷移テストだけ、可能な範囲でWebKitでも確かめる(hasTouchが必要なため
  // uiプロジェクトからは除外する)。既存の大半のテスト(hero canvasのWebGL判定、Leaflet
  // マップ等)はWebKit固有の差異で揺れやすく、webkit-touchプロジェクトの対象外にする。
  projects: [
    { name: 'ui', grepInvert: /@webgl|@touch/, use: { ...devices['Desktop Chrome'] } },
    { name: 'webgl', grep: /@webgl/, workers: 1, use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit-touch', use: { ...devices['Desktop Safari'], hasTouch: true }, grep: /@touch/ },
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
