<script lang="ts">
  import { arState } from '../state';
  import {
    handleStart,
    handleStartAlign,
    handleAnimToggle,
    handleRealign,
    handleRetry,
    adjustHeight,
    confirmTap,
  } from '../controller';

  const ALIGN_MAX_DISTANCE_METERS = 300;
  const TAP_MOVE_THRESHOLD_PX = 10;

  let starting = $state(false);

  async function onStartClick(): Promise<void> {
    starting = true;
    try {
      await handleStart();
    } finally {
      starting = false;
    }
  }

  let coarseInfoText = $derived.by(() => {
    const d = $arState.coarseDistance;
    const b = $arState.coarseBearing;
    if (d == null || b == null) return '距離: -- / 方角: --';
    return `距離: ${d.toFixed(0)} m / 方角: ${b.toFixed(0)}°`;
  });

  let startAlignLabel = $derived(
    $arState.startAlignDisabled && $arState.coarseDistance != null
      ? `対象まで ${$arState.coarseDistance.toFixed(0)} m(${ALIGN_MAX_DISTANCE_METERS} m 以内で開始)`
      : '位置合わせを開始'
  );

  let animToggleLabel = $derived($arState.animOpen ? 'ゲートを閉じる' : 'ゲートを開く');

  // --- align-touch-layer のポインタ操作(タップ確定 / 上下ドラッグで高さ調整) ---
  let pointerDown = false;
  let startX = 0;
  let startY = 0;
  let prevY = 0;
  let moved = false;

  function onPointerDown(e: PointerEvent): void {
    pointerDown = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    prevY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!pointerDown) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > TAP_MOVE_THRESHOLD_PX) {
      moved = true;
    }
    if (moved) {
      adjustHeight(prevY - e.clientY);
    }
    prevY = e.clientY;
  }

  function onPointerUp(e: PointerEvent): void {
    if (!pointerDown) return;
    pointerDown = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (!moved) confirmTap();
  }

  function onPointerCancel(): void {
    pointerDown = false;
  }
</script>

{#if $arState.stage === 'intro'}
  <section class="fullscreen-panel">
    <div class="inner">
      <div class="big-icon">🌊</div>
      <h2>実物の水門にARを重ねます</h2>
      <p>体験には以下の許可が必要です。次の画面で許可してください。</p>
      <div class="permission-list">
        📷 <b>カメラ</b> — 現実の風景にモデルを重ねるため<br />
        📍 <b>位置情報</b> — あなたと水門の位置関係を計算するため<br />
        📱 <b>モーションセンサー</b> — 端末の向きを検出するため
      </div>
      <button type="button" class="primary-button" onclick={onStartClick} disabled={starting}>開始する</button>
      <p class="intro-note">屋外の見通しの良い場所でご利用ください</p>
    </div>
  </section>
{/if}

{#if $arState.stage === 'gps-acquiring'}
  <section class="bottom-panel">
    <div class="hint"><span class="spinner"></span>現在地を取得しています…</div>
    <div class="sub">
      GPS精度: {$arState.gpsAccuracy != null ? `${$arState.gpsAccuracy.toFixed(1)} m` : '--'}(30 m 以下で開始)
    </div>
  </section>
{/if}

{#if $arState.stage === 'coarse'}
  <section class="bottom-panel">
    <div class="hint">対象の方向にカメラを向けてください</div>
    <div class="coarse-info">{coarseInfoText}</div>
    <div class="button-row">
      <button type="button" class="primary-button" onclick={handleStartAlign} disabled={$arState.startAlignDisabled}>
        {startAlignLabel}
      </button>
    </div>
  </section>
{/if}

{#if $arState.stage === 'aligning'}
  <section>
    <div class="guide-banner">輪郭を実物に合わせてタップ</div>
    <div class="bottom-panel">
      <div class="hint small">体を回して輪郭を実物に重ねる / 上下ドラッグで高さ調整</div>
    </div>
    <div
      id="align-touch-layer"
      role="button"
      tabindex="0"
      aria-label="タップして位置合わせを確定、上下ドラッグで高さ調整"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerCancel}
    ></div>
  </section>
{/if}

{#if $arState.stage === 'anchored'}
  <section class="bottom-panel">
    <div class="button-row">
      {#if $arState.hasAnim}
        <button type="button" class="primary-button" onclick={handleAnimToggle}>{animToggleLabel}</button>
      {/if}
      <button type="button" class="secondary-button" onclick={handleRealign}>合わせ直す</button>
    </div>
  </section>
{/if}

{#if $arState.stage === 'error'}
  <section class="fullscreen-panel">
    <div class="inner">
      <div class="big-icon">⚠️</div>
      <h2>開始できませんでした</h2>
      <p>{$arState.errorMessage}</p>
      <button type="button" class="primary-button" onclick={handleRetry}>もう一度試す</button>
    </div>
  </section>
{/if}

<style>
  .fullscreen-panel {
    position: fixed;
    inset: 0;
    z-index: 12000;
    background: rgba(3, 6, 12, 0.94);
  }
  .fullscreen-panel .inner {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(86vw, 360px);
    text-align: center;
  }
  .big-icon {
    font-size: 44px;
    margin-bottom: 14px;
  }
  .fullscreen-panel h2 {
    margin: 0 0 12px;
    font-size: 20px;
  }
  .fullscreen-panel p {
    margin: 0 0 10px;
    font-size: 14px;
    line-height: 1.7;
    opacity: 0.88;
  }
  .permission-list {
    text-align: left;
    margin: 0 auto 20px;
    padding: 12px 16px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    font-size: 13px;
    line-height: 1.8;
  }
  .primary-button {
    padding: 14px 32px;
    border-radius: 14px;
    border: none;
    background: linear-gradient(135deg, #4e9bff, #6ad0ff);
    color: #0c1018;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
  }
  .primary-button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .intro-note {
    margin-top: 14px;
    font-size: 12px;
    opacity: 0.6;
  }

  .bottom-panel {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: 14px;
    z-index: 11000;
    padding: 12px 14px;
    border-radius: 14px;
    background: rgba(10, 14, 24, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(8px);
    text-align: center;
  }
  .hint {
    font-size: 13px;
    line-height: 1.6;
    margin-bottom: 10px;
  }
  .hint.small {
    margin-bottom: 0;
    font-size: 12px;
    opacity: 0.8;
  }
  .sub {
    font-size: 12px;
    opacity: 0.75;
  }
  .coarse-info {
    font-size: 13px;
    margin-bottom: 10px;
  }
  .button-row {
    display: flex;
    gap: 10px;
    justify-content: center;
  }
  .secondary-button {
    padding: 11px 18px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }

  .guide-banner {
    position: fixed;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 11000;
    padding: 10px 18px;
    border-radius: 999px;
    background: rgba(78, 155, 255, 0.92);
    color: #06101f;
    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
  }
  #align-touch-layer {
    position: fixed;
    inset: 0;
    z-index: 9000;
    touch-action: none;
  }

  .spinner {
    display: inline-block;
    width: 18px;
    height: 18px;
    margin-right: 8px;
    vertical-align: -4px;
    border: 3px solid rgba(255, 255, 255, 0.25);
    border-top-color: #6ad0ff;
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
