import { test, expect } from '@playwright/test';

test.describe('landing page', () => {
  test('loads with no console errors and a working hero canvas', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForTimeout(500); // let the hero shader attempt its first frames

    const hasWebgl = await page.locator('.hero-canvas').evaluate((canvas: HTMLCanvasElement) => {
      return !!(canvas.getContext('webgl') || canvas.getContext('webgl2'));
    });
    expect(hasWebgl).toBe(true);
    expect(errors).toEqual([]);
  });

  // 既知の環境制約: ヘッドレスChromeのタブが(スケジューリングの巡り合わせで)他の
  // アクティブなタブ・処理と同時に走っていない瞬間があると、requestAnimationFrame
  // 自体は規則的に呼ばれ続けるのに、コールバックへ渡される timestamp(now) の更新が
  // 数秒〜最大10秒ほど止まることがある(実機では発生しない。compositorが実際の
  // フレーム提示をしていない間、"直近の提示時刻"を使い回しているとみられる挙動で、
  // アプリ側のバグではない)。アプリの tick() はこの timestamp の差分(dt)で進捗を
  // 計算するため、この間は見かけ上停止する。十分長いタイムアウトと、不運な巡り合わせ
  // を引いた場合のための再試行で、環境のこの制約を吸収する。
  test.describe('experience menu auto-scroll (timestamp-stall tolerant)', () => {
    test.describe.configure({ retries: 2 });

    test('auto-scrolls, pauses on pointerenter, and resumes on pointerleave', async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto('/');
      const flow = page.locator('.menu-flow');

      const scrollLeft = () => flow.evaluate((el) => el.scrollLeft);
      const POLL_TIMEOUT = 30_000;

      const start = await scrollLeft();
      await expect.poll(scrollLeft, { timeout: POLL_TIMEOUT }).toBeGreaterThan(start);

      // 実際のマウス移動ではなく、アプリの pointerenter/pointerleave ハンドラを直接
      // ディスパッチする。検証したいのはアプリ自身の一時停止/再開ロジックであって、
      // 自動化レイヤの:hover疑似クラス反映のタイミングではないため。
      await flow.dispatchEvent('pointerenter');
      const whilePaused1 = await scrollLeft();
      await page.waitForTimeout(500);
      const whilePaused2 = await scrollLeft();
      expect(whilePaused2).toBe(whilePaused1);

      await flow.dispatchEvent('pointerleave');
      const afterResumeStart = await scrollLeft();
      await expect.poll(scrollLeft, { timeout: POLL_TIMEOUT }).toBeGreaterThan(afterResumeStart);
    });
  });

  test('respects prefers-reduced-motion by not auto-scrolling', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const flow = page.locator('.menu-flow');

    const scrollLeft = () => flow.evaluate((el) => el.scrollLeft);
    const start = await scrollLeft();
    await page.waitForTimeout(1500);
    expect(await scrollLeft()).toBe(start);
  });

  test('menu links to Unity, plane AR and viewer; onsite AR remains unavailable', async ({ page }) => {
    await page.goto('/');
    // メニューはマーキー(横流れ)用に2セット連続で描画される。後半セットは
    // aria-hidden="true" でスクリーンリーダー・ロケータから隠された複製。
    const visibleCards = page.locator('.menu-card:not([aria-hidden="true"])');

    const unityCard = visibleCards.filter({ hasText: '閉伊川3D世界' });
    await expect(unityCard).toHaveAttribute('href', '/unity/');

    await expect(visibleCards.filter({ hasText: '手のひら・平面AR' })).toHaveAttribute('href', '/ar/place');
    await expect(visibleCards.filter({ hasText: '3Dビューア' })).toHaveAttribute('href', '/viewer');
    for (const title of ['現地AR']) {
      const card = visibleCards.filter({ hasText: title });
      await expect(card).toHaveClass(/soon/);
      await expect(card).not.toHaveAttribute('href', /.+/);
    }
  });

  test('production build has no /lab or dev-only links on the top page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a[href*="/lab/"]')).toHaveCount(0);
    await expect(page.getByText('開発者実験')).toHaveCount(0);
  });
});
