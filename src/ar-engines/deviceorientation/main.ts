/**
 * Pattern C: 独自 DeviceOrientation(3段位置合わせ: GPS粗配置 → シルエット合わせ → ローカル追従)。
 * 旧 suimonAR の src/onsite-ar/main.ts を移植。WebXR 分岐(xrController)は完全に除去し、
 * センサー追従(RelativeOrientationControls)のみを唯一の確定後トラッキング方式とする。
 *
 * ステートマシン:
 *   intro → (権限取得) → gps-acquiring → coarse → aligning → anchored
 *                                                    ↑           │合わせ直す
 *                                                    └───────────┘
 *
 * ステージ2(aligning)はカメラヨー追従リグ方式:
 * ワールド固定のままだと実物とシルエットが画面上で一緒に動き、ユーザーが
 * 差を詰められないため、シルエットを毎フレーム カメラ位置+カメラヨーに
 * 追従させて画面中央に固定する(ピッチ/ロールはワールド固定のまま)。
 * ユーザーは体を回して実物を輪郭の後ろに重ね、タップで確定する。
 * 確定の瞬間、端末は物理的に βtrue を向いているので、カメラ quaternion との
 * 差からヨー補正をコンパス非依存で逆算できる。
 */
import * as THREE from 'three';
import { LocationScene } from './engine';
import { applyModelTransform, prepareModelInstance } from './modelTransform';
import { calcBearing, calcDistanceMeters, normalizeDeg180 } from '../../lib/geo/geodesy';
import { loadLocationConfig, applyLatLonOverride, type LocationConfig } from '../../lib/config/locationConfig';
import { computeFinalScale, type LoadedModel } from '../../lib/model/normalizeModel';
import { loadModel } from '../../lib/loaders/loadModel';
import { withBase } from '../../lib/paths';
import { createSilhouette } from '../../lib/ar/silhouette';
import { bearingFromQuaternion, bearingToThreeYawRad, computeHeadingCorrection } from '../../lib/alignment/heading';
import { AlignmentMetrics } from '../../lib/debug/metrics';
import { copyTextToClipboard, createDebugOverlay, isDebugEnabled, type DebugOverlay } from '../../lib/debug/overlay';

type Stage = 'intro' | 'gps-acquiring' | 'coarse' | 'aligning' | 'anchored' | 'error';

type GeoPosition = {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
};

const GPS_READY_ACCURACY_METERS = 30;
const ALIGN_MAX_DISTANCE_METERS = 300;
const GPS_TIMEOUT_MS = 45000;
const TAP_MOVE_THRESHOLD_PX = 10;
const CAMERA_FOV_DEG = 60; // LocationScene のカメラと一致させる(ドラッグ感度計算用)

const state = {
  stage: 'intro' as Stage,
  scene: null as LocationScene | null,
  target: null as LocationConfig | null,
  template: null as LoadedModel | null,
  modelScale: 1,
  lastGps: null as GeoPosition | null, // 平滑化済み(注入された)GPS
  lastSample: null as GeoPosition | null, // 生サンプル(注入停止中も更新)
  configLoaded: false,
  // coarse
  coarseAnchor: null as THREE.Group | null,
  // aligning
  rig: null as THREE.Group | null,
  rigHolder: null as THREE.Group | null,
  rigSilhouette: null as THREE.Object3D | null,
  rigDistance: 50,
  rigBearing: 0,
  dyAdjustMeters: 0,
  // anchored
  anchoredObject: null as THREE.Group | null,
  mixer: null as THREE.AnimationMixer | null,
  actions: [] as THREE.AnimationAction[],
  animOpen: false,
  confirmGps: null as GeoPosition | null,
  gpsTimeoutTimer: null as ReturnType<typeof setTimeout> | null,
};

const metrics = new AlignmentMetrics();
let overlay: DebugOverlay | null = null;

const tmpQuat = new THREE.Quaternion();
const tmpVec = new THREE.Vector3();

// --- DOM ---

const panels: Record<Stage, HTMLElement | null> = {
  intro: document.getElementById('panel-intro'),
  'gps-acquiring': document.getElementById('panel-gps'),
  coarse: document.getElementById('panel-coarse'),
  aligning: document.getElementById('panel-aligning'),
  anchored: document.getElementById('panel-anchored'),
  error: document.getElementById('panel-error'),
};

const dom = {
  startButton: document.getElementById('start-button') as HTMLButtonElement | null,
  gpsStatus: document.getElementById('gps-status'),
  coarseInfo: document.getElementById('coarse-info'),
  startAlignButton: document.getElementById('start-align-button') as HTMLButtonElement | null,
  alignTouchLayer: document.getElementById('align-touch-layer'),
  animToggleButton: document.getElementById('anim-toggle-button') as HTMLButtonElement | null,
  realignButton: document.getElementById('realign-button') as HTMLButtonElement | null,
  errorMessage: document.getElementById('error-message'),
  retryButton: document.getElementById('retry-button') as HTMLButtonElement | null,
  trackingBanner: document.getElementById('tracking-banner'),
};

function transition(stage: Stage): void {
  state.stage = stage;
  (Object.keys(panels) as Stage[]).forEach((key) => {
    panels[key]?.classList.toggle('active', key === stage);
  });
  overlay?.setRow('stage', stage);
  console.log(`[deviceorientation] stage → ${stage}`);
}

function showError(message: string): void {
  if (dom.errorMessage) dom.errorMessage.textContent = message;
  transition('error');
}

// --- 権限(iOS のモーションセンサー) ---

function needsIOSPermission(): boolean {
  const needsMotion =
    typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as any).requestPermission === 'function';
  const needsOrientation =
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof (DeviceOrientationEvent as any).requestPermission === 'function';
  return needsMotion || needsOrientation;
}

async function requestMotionPermission(): Promise<boolean> {
  let granted = true;
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      const r = await (DeviceMotionEvent as any).requestPermission();
      granted = granted && (r === 'granted' || r === undefined);
    }
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
      const r = await (DeviceOrientationEvent as any).requestPermission();
      granted = granted && (r === 'granted' || r === undefined);
    }
  } catch (e) {
    console.warn('[deviceorientation] requestPermission failed', e);
    return false;
  }
  return granted;
}

// --- 設定・モデル ---

function resolveLocationId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('loc') || 'heigawa-suimon';
}

async function loadTarget(): Promise<void> {
  const locationId = resolveLocationId();
  const result = await loadLocationConfig(withBase(`/config/locations/${locationId}.json`));
  if (result.issues.length) {
    console.warn('[deviceorientation] 設定の不足:\n - ' + result.issues.join('\n - '));
  }
  const cfg = applyLatLonOverride(result.config, new URLSearchParams(window.location.search));
  state.target = cfg;
  metrics.targetId = cfg.id;

  const template = await loadModel(withBase(cfg.modelPath));
  state.template = template;

  const { finalScale } = computeFinalScale(
    { targetHeightMeters: cfg.targetHeightMeters, scale: cfg.scale },
    { height: template.bboxHeight }
  );
  state.modelScale = finalScale;

  state.configLoaded = true;
  console.log(`[deviceorientation] target loaded: ${cfg.id} (${cfg.modelPath})`);
  maybeEnterCoarse();
}

// --- LocationScene 起動とGPSハンドリング ---

function startLocationScene(): void {
  const scene = new LocationScene({ gpsMinDistance: 1.5, gpsMinAccuracy: 60 });
  state.scene = scene;

  scene.onGpsSample((sample) => {
    state.lastSample = sample;
    metrics.recordGpsSample(sample);
    overlay?.setRow('GPS精度', `${sample.accuracy.toFixed(1)}m`);
    if (state.stage === 'gps-acquiring' && dom.gpsStatus) {
      dom.gpsStatus.textContent = `GPS精度: ${sample.accuracy.toFixed(1)} m(${GPS_READY_ACCURACY_METERS} m 以下で開始)`;
    }
    if (state.stage === 'anchored' && state.confirmGps) {
      const drift = calcDistanceMeters(state.confirmGps.latitude, state.confirmGps.longitude, sample.latitude, sample.longitude);
      overlay?.setRow('GPSドリフト', `${drift.toFixed(1)}m`);
    }
  });

  scene.onGpsUpdate((pos) => {
    state.lastGps = pos;
    if (state.stage === 'gps-acquiring') maybeEnterCoarse();
    if (state.stage === 'coarse') updateCoarseHud();
    if (state.stage === 'aligning') updateRigParams();
  });

  scene.onOrientationStatus((status) => {
    if (status === 'touch') {
      if (isDebugEnabled()) {
        if (dom.trackingBanner) {
          dom.trackingBanner.textContent = 'デバッグ: 方位センサーなし(タッチ操作)';
          dom.trackingBanner.style.display = '';
        }
      } else {
        showError('この端末では方位センサーが利用できないため、このARパターンを利用できません。モーションセンサーを許可してからお試しください。');
      }
    }
  });

  scene.onBeforeRender(handleFrame);

  // iOS: 許可取得後の orientation 再接続
  scene.reconnectOrientation();

  state.gpsTimeoutTimer = setTimeout(() => {
    if (state.stage === 'gps-acquiring') {
      showError('GPSを取得できませんでした。屋外の見通しの良い場所で再度お試しください。');
    }
  }, GPS_TIMEOUT_MS);
}

function maybeEnterCoarse(): void {
  if (state.stage !== 'gps-acquiring') return;
  if (!state.configLoaded || !state.scene?.isOriginReady || !state.lastGps) return;
  if (state.lastGps.accuracy > GPS_READY_ACCURACY_METERS) return;
  enterCoarse();
}

// --- ステージ1: 粗配置 ---

function enterCoarse(): void {
  const { scene, target, template } = state;
  if (!scene || !target || !template) return;

  if (!state.coarseAnchor) {
    const sil = createSilhouette(template);
    applyModelTransform(sil, template, { scale: state.modelScale, rotationDeg: target.yawDeg, heightOffset: 0 });
    const anchor = new THREE.Group();
    anchor.add(sil);
    scene.addAtLatLon(anchor, target.latitude!, target.longitude!, target.altitude);
    state.coarseAnchor = anchor;
  }

  transition('coarse');
  updateCoarseHud();
}

function updateCoarseHud(): void {
  const { target, lastGps } = state;
  if (!target || !lastGps) return;
  const distance = calcDistanceMeters(lastGps.latitude, lastGps.longitude, target.latitude!, target.longitude!);
  const bearing = calcBearing(lastGps.latitude, lastGps.longitude, target.latitude!, target.longitude!);
  if (dom.coarseInfo) {
    dom.coarseInfo.textContent = `距離: ${distance.toFixed(0)} m / 方角: ${bearing.toFixed(0)}°`;
  }
  if (dom.startAlignButton) {
    const tooFar = distance > ALIGN_MAX_DISTANCE_METERS;
    dom.startAlignButton.disabled = tooFar;
    dom.startAlignButton.textContent = tooFar
      ? `対象まで ${distance.toFixed(0)} m(${ALIGN_MAX_DISTANCE_METERS} m 以内で開始)`
      : '位置合わせを開始';
  }
  overlay?.setRow('距離', `${distance.toFixed(1)}m`);
  overlay?.setRow('βtrue', `${bearing.toFixed(1)}°`);
}

// --- ステージ2: シルエット合わせ ---

function enterAligning(): void {
  const { scene, target, template } = state;
  if (!scene || !target || !template) return;

  if (state.coarseAnchor) {
    scene.remove(state.coarseAnchor);
    state.coarseAnchor = null;
  }
  removeAnchoredObject();

  const rig = new THREE.Group();
  const holder = new THREE.Group();
  const sil = createSilhouette(template);
  rig.add(holder);
  holder.add(sil);
  scene.addSceneObject(rig);

  state.rig = rig;
  state.rigHolder = holder;
  state.rigSilhouette = sil;
  updateRigParams();

  metrics.markStage2Start();
  transition('aligning');
}

/** GPS更新時に距離・方位を取り直し、リグ内のシルエット配置を更新する。 */
function updateRigParams(): void {
  const { target, template, lastGps, rigHolder, rigSilhouette } = state;
  if (!target || !template || !lastGps || !rigHolder || !rigSilhouette) return;

  state.rigDistance = calcDistanceMeters(lastGps.latitude, lastGps.longitude, target.latitude!, target.longitude!);
  state.rigBearing = calcBearing(lastGps.latitude, lastGps.longitude, target.latitude!, target.longitude!);

  // リグはカメラヨーに追従するため、シルエットのローカルヨーには βtrue を足し込んで
  // 「βtrue 方向から見たときの実際の見え方」を再現する(three.js Y回転 = 回転角 + βtrue)
  applyModelTransform(rigSilhouette, template, {
    scale: state.modelScale,
    rotationDeg: target.yawDeg + state.rigBearing,
    heightOffset: 0,
  });
  rigHolder.position.set(0, 0, -state.rigDistance); // y は毎フレーム更新
}

/** 毎フレーム: リグをカメラ位置+カメラヨーに追従させる(ピッチ/ロールはワールド固定)。 */
function handleFrame(deltaSeconds: number): void {
  const scene = state.scene;
  if (!scene) return;

  if (state.stage === 'aligning' && state.rig && state.rigHolder && state.target) {
    const camPos = scene.getCameraWorldPosition(tmpVec);
    const camQuat = scene.getCameraQuaternion(tmpQuat);
    state.rig.position.copy(camPos);
    state.rig.rotation.set(0, bearingToThreeYawRad(bearingFromQuaternion(camQuat)), 0);
    const worldBaseY = state.target.altitude + state.dyAdjustMeters;
    state.rigHolder.position.y = worldBaseY - camPos.y;
    overlay?.setRow('βvirtual', `${bearingFromQuaternion(camQuat).toFixed(1)}°`);
    if (metrics.stage2StartTs !== null) {
      overlay?.setRow('stage2経過', `${((Date.now() - metrics.stage2StartTs) / 1000).toFixed(0)}s`);
    }
  }

  if (state.stage === 'anchored' && state.mixer) {
    state.mixer.update(deltaSeconds);
  }
}

function setupAlignTouchLayer(): void {
  const layer = dom.alignTouchLayer;
  if (!layer) return;

  let pointerDown = false;
  let startX = 0;
  let startY = 0;
  let prevY = 0;
  let moved = false;

  layer.addEventListener('pointerdown', (e: PointerEvent) => {
    pointerDown = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    prevY = e.clientY;
    layer.setPointerCapture(e.pointerId);
  });

  layer.addEventListener('pointermove', (e: PointerEvent) => {
    if (!pointerDown) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > TAP_MOVE_THRESHOLD_PX) {
      moved = true;
    }
    if (moved) {
      // 上ドラッグ = モデルを上へ。距離に応じた m/px で自然な感度にする
      const metersPerPixel = (2 * state.rigDistance * Math.tan((CAMERA_FOV_DEG / 2) * (Math.PI / 180))) / window.innerHeight;
      state.dyAdjustMeters += (prevY - e.clientY) * metersPerPixel;
      overlay?.setRow('高さ補正', `${state.dyAdjustMeters.toFixed(1)}m`);
    }
    prevY = e.clientY;
  });

  layer.addEventListener('pointerup', (e: PointerEvent) => {
    if (!pointerDown) return;
    pointerDown = false;
    layer.releasePointerCapture(e.pointerId);
    if (!moved && state.stage === 'aligning') {
      confirmAlignment();
    }
  });

  layer.addEventListener('pointercancel', () => {
    pointerDown = false;
  });
}

// --- 確定 → ステージ3 ---

function confirmAlignment(): void {
  const { scene, target } = state;
  const gps = state.lastGps;
  if (!scene || !target || !gps) return;

  const camQuat = scene.getCameraQuaternion();
  const result = computeHeadingCorrection({
    cameraQuaternion: camQuat,
    userLat: gps.latitude,
    userLon: gps.longitude,
    targetLat: target.latitude!,
    targetLon: target.longitude!,
  });
  const distance = calcDistanceMeters(gps.latitude, gps.longitude, target.latitude!, target.longitude!);

  metrics.markConfirm({
    correctionDeg: result.correctionDeg,
    trueBearingDeg: result.trueBearingDeg,
    virtualBearingDeg: result.virtualBearingDeg,
    distanceMeters: distance,
    gpsAccuracyMeters: gps.accuracy ?? null,
    lat: gps.latitude,
    lon: gps.longitude,
    trackingMode: 'sensor',
  });
  state.confirmGps = gps;
  overlay?.setRow('補正値', `${result.correctionDeg.toFixed(1)}°`);
  console.log(
    `[deviceorientation] confirm: βtrue=${result.trueBearingDeg.toFixed(1)}° βv=${result.virtualBearingDeg.toFixed(1)}° 補正=${result.correctionDeg.toFixed(1)}°`
  );

  removeRig();
  startSensorTracking(result.correctionDeg);
}

function removeRig(): void {
  if (state.rig && state.scene) {
    state.scene.removeSceneObject(state.rig);
  }
  state.rig = null;
  state.rigHolder = null;
  state.rigSilhouette = null;
}

function startSensorTracking(correctionDeg: number): void {
  const { scene, target, template } = state;
  if (!scene || !target || !template) return;

  // GPS再注入を完全停止 → ヨー補正適用 → コンパス非依存追従へ(この順序が必須)
  scene.pauseGpsInjection();
  scene.setYawCorrectionDeg(correctionDeg);
  scene.useRelativeOrientation(true);

  const inst = template.root.clone(true);
  applyModelTransform(inst, template, { scale: state.modelScale, rotationDeg: target.yawDeg, heightOffset: 0 });
  prepareModelInstance(inst);

  if (template.animations.length) {
    state.mixer = new THREE.AnimationMixer(inst);
    state.actions = template.animations.map((clip) => {
      const action = state.mixer!.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      return action;
    });
  }

  const anchor = new THREE.Group();
  anchor.add(inst);
  scene.addAtLatLon(anchor, target.latitude!, target.longitude!, target.altitude + state.dyAdjustMeters);
  state.anchoredObject = anchor;

  enterAnchored();
}

function enterAnchored(): void {
  const hasAnim = state.actions.length > 0;
  if (dom.animToggleButton) {
    dom.animToggleButton.style.display = hasAnim ? '' : 'none';
    dom.animToggleButton.textContent = 'ゲートを開く';
  }
  if (dom.realignButton) {
    dom.realignButton.textContent = '合わせ直す';
  }
  state.animOpen = false;
  if (dom.trackingBanner && !isDebugEnabled()) {
    dom.trackingBanner.style.display = '';
    setTimeout(() => {
      if (dom.trackingBanner) dom.trackingBanner.style.display = 'none';
    }, 6000);
  }
  overlay?.setRow('追従', 'sensor');
  transition('anchored');
}

function removeAnchoredObject(): void {
  if (state.anchoredObject && state.scene) {
    state.scene.remove(state.anchoredObject);
  }
  state.anchoredObject = null;
  state.mixer = null;
  state.actions = [];
  state.animOpen = false;
}

// --- アニメーション ---

function playOpenClose(open: boolean): void {
  for (const action of state.actions) {
    const duration = action.getClip().duration;
    action.enabled = true;
    action.paused = false;
    if (open) {
      action.timeScale = 1;
      if (action.time >= duration) action.time = 0;
    } else {
      action.timeScale = -1;
      if (action.time <= 0) action.time = duration;
    }
    action.play();
  }
}

// --- UI 配線 ---

function setupUi(): void {
  dom.startButton?.addEventListener('click', async () => {
    if (dom.startButton) dom.startButton.disabled = true;
    try {
      if (needsIOSPermission()) {
        const ok = await requestMotionPermission();
        if (!ok) {
          showError('モーションセンサーが許可されませんでした。設定から許可して再度お試しください。');
          return;
        }
      }
      transition('gps-acquiring');
      startLocationScene();
      loadTarget().catch((error) => {
        console.warn('[deviceorientation] 設定読み込みに失敗', error);
        showError(`地点設定を読み込めませんでした: ${(error as Error)?.message ?? error}`);
      });
    } finally {
      if (dom.startButton) dom.startButton.disabled = false;
    }
  });

  dom.startAlignButton?.addEventListener('click', () => {
    if (state.stage === 'coarse') enterAligning();
  });

  dom.animToggleButton?.addEventListener('click', () => {
    state.animOpen = !state.animOpen;
    playOpenClose(state.animOpen);
    if (dom.animToggleButton) {
      dom.animToggleButton.textContent = state.animOpen ? 'ゲートを閉じる' : 'ゲートを開く';
    }
  });

  dom.realignButton?.addEventListener('click', () => {
    const scene = state.scene;
    if (!scene) return;
    removeAnchoredObject();
    scene.resumeGpsInjection();
    scene.setYawCorrectionDeg(0);
    scene.useRelativeOrientation(false);
    state.confirmGps = null;
    enterAligning();
  });

  dom.retryButton?.addEventListener('click', () => {
    window.location.reload();
  });

  setupAlignTouchLayer();
}

// --- デバッグオーバーレイ ---

function setupOverlay(): void {
  if (!isDebugEnabled()) return;
  overlay = createDebugOverlay();
  overlay.setRow('stage', state.stage);

  overlay.onRecordResidual(() => {
    const { target, scene } = state;
    const sample = state.lastSample;
    if (!target || !sample) {
      overlay?.flash('GPSサンプルがありません');
      return;
    }
    if (!scene) {
      overlay?.flash('シーンがありません');
      return;
    }
    const trueBearingNow = calcBearing(sample.latitude, sample.longitude, target.latitude!, target.longitude!);
    const virtualBearingNow = bearingFromQuaternion(scene.getCameraQuaternion());
    const residual = normalizeDeg180(trueBearingNow - virtualBearingNow);
    const drift = state.confirmGps
      ? calcDistanceMeters(state.confirmGps.latitude, state.confirmGps.longitude, sample.latitude, sample.longitude)
      : null;
    metrics.recordDrift({ gpsDriftMeters: drift, yawResidualDeg: residual });
    overlay?.flash(`ヨー残差 ${residual.toFixed(1)}° を記録しました`);
  });

  overlay.onCopyResults(async () => {
    const json = metrics.toJSON();
    delete (json as any).gpsSamples; // クリップボードには要約のみ(生サンプルは巨大)
    const text = `${metrics.toMarkdownSnippet()}\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\n`;
    const ok = await copyTextToClipboard(text);
    overlay?.flash(ok ? '計測結果をコピーしました' : 'コピーに失敗しました');
  });
}

// --- 起動 ---

export function bootDeviceOrientationAR(): void {
  setupUi();
  setupOverlay();
}
