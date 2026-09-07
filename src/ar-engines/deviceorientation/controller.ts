/**
 * controller.ts (Pattern C) — main.ts をエンジン呼び出し + UI状態更新の
 * 「コントローラ」層として再構成したもの。3段位置合わせ(GPS粗配置 → シルエット
 * 合わせ → ローカル追従)のAR計算ロジック自体(座標変換・ヘディング補正・
 * リグ追従の幾何計算)は一切変更していない。ここでは「エンジンのコールバックを
 * 受けて arState(Svelte store)を更新する」ことと「Svelteコンポーネントからの
 * 操作(ボタン・ドラッグ)をエンジンへ橋渡しする」ことだけを行う。DOM操作は
 * 一切しない(Svelteコンポーネント側の責務)。
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
import { get } from 'svelte/store';
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
import { copyTextToClipboard } from '../../lib/debug/overlay';
import { arState, type Stage } from './state';

type GeoPosition = {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
};

const GPS_READY_ACCURACY_METERS = 30;
const ALIGN_MAX_DISTANCE_METERS = 300;
const GPS_TIMEOUT_MS = 45000;
const CAMERA_FOV_DEG = 60; // LocationScene のカメラと一致させる(ドラッグ感度計算用)

// three.js/エンジンのインスタンスはリアクティブ store に乗せず、モジュール
// ローカルに保持する(store はUI表示用の値だけを持つ)。
let scene: LocationScene | null = null;
let target: LocationConfig | null = null;
let template: LoadedModel | null = null;
let modelScale = 1;
let lastGps: GeoPosition | null = null; // 平滑化済み(注入された)GPS
let lastSample: GeoPosition | null = null; // 生サンプル(注入停止中も更新)
let configLoaded = false;

let coarseAnchor: THREE.Group | null = null;

let rig: THREE.Group | null = null;
let rigHolder: THREE.Group | null = null;
let rigSilhouette: THREE.Object3D | null = null;
let rigDistance = 50;
let rigBearing = 0;
let dyAdjustMeters = 0;

let anchoredObject: THREE.Group | null = null;
let mixer: THREE.AnimationMixer | null = null;
let actions: THREE.AnimationAction[] = [];
let confirmGps: GeoPosition | null = null;
let gpsTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

const metrics = new AlignmentMetrics();

const tmpQuat = new THREE.Quaternion();
const tmpVec = new THREE.Vector3();

function setDebugRow(key: string, value: string): void {
  arState.update((s) => ({ ...s, debugRows: { ...s.debugRows, [key]: value } }));
}

function flash(message: string): void {
  arState.update((s) => ({ ...s, debugFlash: message }));
  setTimeout(() => arState.update((s) => (s.debugFlash === message ? { ...s, debugFlash: '' } : s)), 4000);
}

function transition(stage: Stage): void {
  arState.update((s) => ({ ...s, stage }));
  setDebugRow('stage', stage);
  console.log(`[deviceorientation] stage → ${stage}`);
}

function showError(message: string): void {
  arState.update((s) => ({ ...s, errorMessage: message }));
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
  target = cfg;
  metrics.targetId = cfg.id;

  const loaded = await loadModel(withBase(cfg.modelPath));
  template = loaded;

  const { finalScale } = computeFinalScale(
    { targetHeightMeters: cfg.targetHeightMeters, scale: cfg.scale },
    { height: loaded.bboxHeight }
  );
  modelScale = finalScale;

  configLoaded = true;
  console.log(`[deviceorientation] target loaded: ${cfg.id} (${cfg.modelPath})`);
  maybeEnterCoarse();
}

// --- LocationScene 起動とGPSハンドリング ---

function startLocationScene(): void {
  const s = new LocationScene({ gpsMinDistance: 1.5, gpsMinAccuracy: 60 });
  scene = s;

  s.onGpsSample((sample) => {
    lastSample = sample;
    metrics.recordGpsSample(sample);
    setDebugRow('GPS精度', `${sample.accuracy.toFixed(1)}m`);
    if (get(arState).stage === 'gps-acquiring') {
      arState.update((st) => ({ ...st, gpsAccuracy: sample.accuracy }));
    }
    if (get(arState).stage === 'anchored' && confirmGps) {
      const drift = calcDistanceMeters(confirmGps.latitude, confirmGps.longitude, sample.latitude, sample.longitude);
      setDebugRow('GPSドリフト', `${drift.toFixed(1)}m`);
    }
  });

  s.onGpsUpdate((pos) => {
    lastGps = pos;
    const stage = get(arState).stage;
    if (stage === 'gps-acquiring') maybeEnterCoarse();
    if (stage === 'coarse') updateCoarseHud();
    if (stage === 'aligning') updateRigParams();
  });

  s.onOrientationStatus((status) => {
    if (status === 'touch') {
      if (get(arState).debugEnabled) {
        arState.update((st) => ({
          ...st,
          trackingBannerText: 'デバッグ: 方位センサーなし(タッチ操作)',
          trackingBannerVisible: true,
        }));
      } else {
        showError('この端末では方位センサーが利用できないため、このARパターンを利用できません。モーションセンサーを許可してからお試しください。');
      }
    }
  });

  s.onBeforeRender(handleFrame);

  // iOS: 許可取得後の orientation 再接続
  s.reconnectOrientation();

  gpsTimeoutTimer = setTimeout(() => {
    if (get(arState).stage === 'gps-acquiring') {
      showError('GPSを取得できませんでした。屋外の見通しの良い場所で再度お試しください。');
    }
  }, GPS_TIMEOUT_MS);
}

function maybeEnterCoarse(): void {
  if (get(arState).stage !== 'gps-acquiring') return;
  if (!configLoaded || !scene?.isOriginReady || !lastGps) return;
  if (lastGps.accuracy > GPS_READY_ACCURACY_METERS) return;
  enterCoarse();
}

// --- ステージ1: 粗配置 ---

function enterCoarse(): void {
  if (!scene || !target || !template) return;

  if (!coarseAnchor) {
    const sil = createSilhouette(template);
    applyModelTransform(sil, template, { scale: modelScale, rotationDeg: target.yawDeg, heightOffset: 0 });
    const anchor = new THREE.Group();
    anchor.add(sil);
    scene.addAtLatLon(anchor, target.latitude!, target.longitude!, target.altitude);
    coarseAnchor = anchor;
  }

  transition('coarse');
  updateCoarseHud();
}

function updateCoarseHud(): void {
  if (!target || !lastGps) return;
  const distance = calcDistanceMeters(lastGps.latitude, lastGps.longitude, target.latitude!, target.longitude!);
  const bearing = calcBearing(lastGps.latitude, lastGps.longitude, target.latitude!, target.longitude!);
  arState.update((s) => ({
    ...s,
    coarseDistance: distance,
    coarseBearing: bearing,
    startAlignDisabled: distance > ALIGN_MAX_DISTANCE_METERS,
  }));
  setDebugRow('距離', `${distance.toFixed(1)}m`);
  setDebugRow('βtrue', `${bearing.toFixed(1)}°`);
}

// --- ステージ2: シルエット合わせ ---

function enterAligning(): void {
  if (!scene || !target || !template) return;

  if (coarseAnchor) {
    scene.remove(coarseAnchor);
    coarseAnchor = null;
  }
  removeAnchoredObject();

  const newRig = new THREE.Group();
  const holder = new THREE.Group();
  const sil = createSilhouette(template);
  newRig.add(holder);
  holder.add(sil);
  scene.addSceneObject(newRig);

  rig = newRig;
  rigHolder = holder;
  rigSilhouette = sil;
  updateRigParams();

  metrics.markStage2Start();
  transition('aligning');
}

/** GPS更新時に距離・方位を取り直し、リグ内のシルエット配置を更新する。 */
function updateRigParams(): void {
  if (!target || !template || !lastGps || !rigHolder || !rigSilhouette) return;

  rigDistance = calcDistanceMeters(lastGps.latitude, lastGps.longitude, target.latitude!, target.longitude!);
  rigBearing = calcBearing(lastGps.latitude, lastGps.longitude, target.latitude!, target.longitude!);

  // リグはカメラヨーに追従するため、シルエットのローカルヨーには βtrue を足し込んで
  // 「βtrue 方向から見たときの実際の見え方」を再現する(three.js Y回転 = 回転角 + βtrue)
  applyModelTransform(rigSilhouette, template, {
    scale: modelScale,
    rotationDeg: target.yawDeg + rigBearing,
    heightOffset: 0,
  });
  rigHolder.position.set(0, 0, -rigDistance); // y は毎フレーム更新
}

/** 毎フレーム: リグをカメラ位置+カメラヨーに追従させる(ピッチ/ロールはワールド固定)。 */
function handleFrame(deltaSeconds: number): void {
  if (!scene) return;
  const stage = get(arState).stage;

  if (stage === 'aligning' && rig && rigHolder && target) {
    const camPos = scene.getCameraWorldPosition(tmpVec);
    const camQuat = scene.getCameraQuaternion(tmpQuat);
    rig.position.copy(camPos);
    rig.rotation.set(0, bearingToThreeYawRad(bearingFromQuaternion(camQuat)), 0);
    const worldBaseY = target.altitude + dyAdjustMeters;
    rigHolder.position.y = worldBaseY - camPos.y;
    setDebugRow('βvirtual', `${bearingFromQuaternion(camQuat).toFixed(1)}°`);
    if (metrics.stage2StartTs !== null) {
      setDebugRow('stage2経過', `${((Date.now() - metrics.stage2StartTs) / 1000).toFixed(0)}s`);
    }
  }

  if (stage === 'anchored' && mixer) {
    mixer.update(deltaSeconds);
  }
}

/** AlignTouchLayer.svelte から呼ばれる。上下ドラッグのピクセル差分をメートルへ変換して高さ補正に加える。 */
export function adjustHeight(dyPixels: number): void {
  const metersPerPixel = (2 * rigDistance * Math.tan((CAMERA_FOV_DEG / 2) * (Math.PI / 180))) / window.innerHeight;
  dyAdjustMeters += dyPixels * metersPerPixel;
  setDebugRow('高さ補正', `${dyAdjustMeters.toFixed(1)}m`);
}

/** AlignTouchLayer.svelte から呼ばれる(ドラッグを伴わないタップ確定)。 */
export function confirmTap(): void {
  if (get(arState).stage === 'aligning') confirmAlignment();
}

// --- 確定 → ステージ3 ---

function confirmAlignment(): void {
  const gps = lastGps;
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
  confirmGps = gps;
  setDebugRow('補正値', `${result.correctionDeg.toFixed(1)}°`);
  console.log(
    `[deviceorientation] confirm: βtrue=${result.trueBearingDeg.toFixed(1)}° βv=${result.virtualBearingDeg.toFixed(1)}° 補正=${result.correctionDeg.toFixed(1)}°`
  );

  removeRig();
  startSensorTracking(result.correctionDeg);
}

function removeRig(): void {
  if (rig && scene) {
    scene.removeSceneObject(rig);
  }
  rig = null;
  rigHolder = null;
  rigSilhouette = null;
}

function startSensorTracking(correctionDeg: number): void {
  if (!scene || !target || !template) return;

  // GPS再注入を完全停止 → ヨー補正適用 → コンパス非依存追従へ(この順序が必須)
  scene.pauseGpsInjection();
  scene.setYawCorrectionDeg(correctionDeg);
  scene.useRelativeOrientation(true);

  const inst = template.root.clone(true);
  applyModelTransform(inst, template, { scale: modelScale, rotationDeg: target.yawDeg, heightOffset: 0 });
  prepareModelInstance(inst);

  if (template.animations.length) {
    mixer = new THREE.AnimationMixer(inst);
    actions = template.animations.map((clip) => {
      const action = mixer!.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      return action;
    });
  }

  const anchor = new THREE.Group();
  anchor.add(inst);
  scene.addAtLatLon(anchor, target.latitude!, target.longitude!, target.altitude + dyAdjustMeters);
  anchoredObject = anchor;

  enterAnchored();
}

function enterAnchored(): void {
  const hasAnim = actions.length > 0;
  arState.update((s) => ({ ...s, hasAnim, animOpen: false }));
  if (!get(arState).debugEnabled) {
    arState.update((s) => ({ ...s, trackingBannerVisible: true }));
    setTimeout(() => arState.update((s) => ({ ...s, trackingBannerVisible: false })), 6000);
  }
  setDebugRow('追従', 'sensor');
  transition('anchored');
}

function removeAnchoredObject(): void {
  if (anchoredObject && scene) {
    scene.remove(anchoredObject);
  }
  anchoredObject = null;
  mixer = null;
  actions = [];
  arState.update((s) => ({ ...s, animOpen: false }));
}

// --- アニメーション ---

function playOpenClose(open: boolean): void {
  for (const action of actions) {
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

// --- UI 操作(Svelteコンポーネントから呼ばれる) ---

export async function handleStart(): Promise<void> {
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
  } catch (error) {
    console.error('[deviceorientation] 開始処理でエラー', error);
  }
}

export function handleStartAlign(): void {
  if (get(arState).stage === 'coarse') enterAligning();
}

export function handleAnimToggle(): void {
  const next = !get(arState).animOpen;
  arState.update((s) => ({ ...s, animOpen: next }));
  playOpenClose(next);
}

export function handleRealign(): void {
  if (!scene) return;
  removeAnchoredObject();
  scene.resumeGpsInjection();
  scene.setYawCorrectionDeg(0);
  scene.useRelativeOrientation(false);
  confirmGps = null;
  enterAligning();
}

export function handleRetry(): void {
  window.location.reload();
}

// --- デバッグオーバーレイの操作 ---

export function recordResidual(): void {
  const sample = lastSample;
  if (!target || !sample) {
    flash('GPSサンプルがありません');
    return;
  }
  if (!scene) {
    flash('シーンがありません');
    return;
  }
  const trueBearingNow = calcBearing(sample.latitude, sample.longitude, target.latitude!, target.longitude!);
  const virtualBearingNow = bearingFromQuaternion(scene.getCameraQuaternion());
  const residual = normalizeDeg180(trueBearingNow - virtualBearingNow);
  const drift = confirmGps
    ? calcDistanceMeters(confirmGps.latitude, confirmGps.longitude, sample.latitude, sample.longitude)
    : null;
  metrics.recordDrift({ gpsDriftMeters: drift, yawResidualDeg: residual });
  flash(`ヨー残差 ${residual.toFixed(1)}° を記録しました`);
}

export async function copyResults(): Promise<void> {
  const json = metrics.toJSON();
  delete (json as any).gpsSamples; // クリップボードには要約のみ(生サンプルは巨大)
  const text = `${metrics.toMarkdownSnippet()}\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\n`;
  const ok = await copyTextToClipboard(text);
  flash(ok ? '計測結果をコピーしました' : 'コピーに失敗しました');
}
