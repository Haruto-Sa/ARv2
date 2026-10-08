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

  test('quick-start pattern buttons point at the three location-AR engines', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('button.pattern-button[formaction="/ar/locar"]')).toBeVisible();
    await expect(page.locator('button.pattern-button[formaction="/ar/arjs"]')).toBeVisible();
    await expect(page.locator('button.pattern-button[formaction="/ar/deviceorientation"]')).toBeVisible();
  });

  test('dragging the menu and releasing over a card does not navigate', async ({ page }) => {
    // 以前、ドラッグ終了直後のclickがカードへの意図しない遷移を起こしたことがある
    // (pointerdown時点で無条件にpointer captureしていたのが原因)。しきい値を
    // 超える移動を伴う本物のドラッグをシミュレートし、遷移が起きないことを確かめる。
    // オートスクロールは常に動いているため切っておく(scrollIntoViewIfNeededの
    // 「要素位置が安定するまで待つ」判定が、動き続ける要素では終わらずタイムアウトしうる)。
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const card = visibleCard(page, '閉伊川3D世界');
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    if (!box) throw new Error('menu card has no bounding box');
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width - 10, y);
    await page.mouse.down();
    await page.mouse.move(box.x - 80, y, { steps: 10 }); // 4px閾値を十分超える移動
    await page.mouse.up();
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(/\/$/);
  });
});

// 体験メニューの「active」なカードそれぞれについて、期待する遷移先。
// ページ内アンカー(#start)も、ページ遷移(/ar/marker等)も両方含む。
const MENU_CARDS: { title: string; href: string; expectedUrl: RegExp }[] = [
  { title: 'ロケーションAR', href: '#start', expectedUrl: /#start$/ },
  { title: '手のひらAR', href: '/ar/marker', expectedUrl: /\/ar\/marker$/ },
  { title: '閉伊川3D世界', href: '/heigawa/', expectedUrl: /\/heigawa\/$/ },
  { title: '流木コンテンツ', href: '/unity/', expectedUrl: /\/unity\/$/ },
  { title: '開発者実験', href: '/lab/compare', expectedUrl: /\/lab\/compare$/ },
];

function visibleCard(page: import('@playwright/test').Page, title: string) {
  // メニューはマーキー(横流れ)用に2セット連続で描画される。後半セットは
  // aria-hidden="true" でスクリーンリーダー・ロケータから隠された複製。
  return page.locator('.menu-card:not([aria-hidden="true"])').filter({ hasText: title });
}

test.describe('menu card navigation (every visible active card)', () => {
  // オートスクロールは常に動いているため切っておく(scrollIntoViewIfNeededの
  // 「要素位置が安定するまで待つ」判定が、動き続ける要素では終わらずタイムアウトしうる)。
  // 検証したいのはクリック/タップでの遷移であって、オートスクロール自体は別テストで扱う。
  test.use({ reducedMotion: 'reduce' });

  for (const { title, href, expectedUrl } of MENU_CARDS) {
    test(`${title}: href attribute is correct`, async ({ page }) => {
      await page.goto('/');
      await expect(visibleCard(page, title)).toHaveAttribute('href', href);
    });

    test(`${title}: a real mouse click navigates`, async ({ page }) => {
      // href属性のチェックだけでは、クリックがドラッグ用のpointerdown/pointermove
      // ハンドラに奪われて実際には遷移しない不具合を検出できない(過去に発生)。
      // page.locator().click() ではなく、実ユーザーと同じ mouse.down()/up() の
      // シーケンスで確かめる。
      await page.goto('/');
      const card = visibleCard(page, title);
      await card.scrollIntoViewIfNeeded();
      const box = await card.boundingBox();
      if (!box) throw new Error(`${title}: menu card has no bounding box`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(50);
      await page.mouse.up();
      await expect(page).toHaveURL(expectedUrl);
    });
  }
});

test.describe('menu card navigation via touch tap', () => {
  test.use({ hasTouch: true, reducedMotion: 'reduce' });

  for (const { title, expectedUrl } of MENU_CARDS) {
    test(`${title}: tap navigates @touch`, async ({ page }) => {
      await page.goto('/');
      const card = visibleCard(page, title);
      await card.scrollIntoViewIfNeeded();
      await card.tap();
      await expect(page).toHaveURL(expectedUrl);
    });
  }
});
