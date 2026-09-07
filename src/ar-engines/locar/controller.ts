// controller.ts (Pattern A: LocAR) — main.ts をエンジン呼び出し + UI状態更新の
// 「コントローラ」層として再構成したもの。AR計算ロジック(座標変換・スケール
// 計算・モデル正規化)は src/lib/ と engine.ts のまま一切変更していない。
// ここでは「エンジンのコールバックを受けて arState(Svelte store)を更新する」
// ことだけを行う。DOM操作は一切しない(Svelteコンポーネント側の責務)。
//
// フロー:
//   1. 紹介ページ表示中に locations/<id>.json を先読み(カメラはまだ起動しない)
//   2. 「ARを開始」タップ → そのユーザー操作の中で
//        - LocationScene を生成(ここで初めてカメラ getUserMedia が走る)
//        - iOS の方位センサー許可を要求
//   3. モデルを GLTFLoader で読み込み → 正規化(底面中央・高さ→scale) → GPS アンカーに配置
//
// 設計方針(元実装から不変):
//   - transform(位置/サイズ/回転/高さ)のベース値は locations/<id>.json だけが供給する。
//   - カメラ追従・距離依存スケール・毎フレームの transform 書き換えはしない。
//   - GPS/方位の安定化は LocationScene が担う(モデルの scale/基準位置は変えない)。

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { get } from 'svelte/store';
import { LocationScene } from './engine';
import { loadLocationConfig, applyLatLonOverride, type LocationConfig } from '../../lib/config/locationConfig';
import { normalizeIntoOrigin } from '../../lib/model/normalizeModel';
import { withBase } from '../../lib/paths';
import { addModelDebugVisuals, addGroundGrid, logConfigSnapshot } from './debugHelpers';
import { loadCorrectionDelta, saveCorrectionDelta, ZERO_DELTA, type CorrectionDelta } from './correctionUI';
import { arState } from './state';

// three.js/エンジンのインスタンスはリアクティブ store に乗せず、モジュール
// ローカルに保持する(store はUI表示用の値だけを持つ)。
let scene: LocationScene | null = null;
let wrapper: THREE.Group | null = null;
let mixer: THREE.AnimationMixer | null = null;
let clock: THREE.Clock | null = null;
let animLoopRunning = false;
let audioEl: HTMLAudioElement | null = null;

function resolveLocationId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('loc') || 'heigawa-suimon';
}

export async function loadInitialConfig(): Promise<void> {
  const locationId = resolveLocationId();
  try {
    const result = await loadLocationConfig(withBase(`/config/locations/${locationId}.json`));
    const config = applyLatLonOverride(result.config, new URLSearchParams(window.location.search));
    const delta = loadCorrectionDelta();
    arState.update((s) => ({ ...s, config, issues: result.issues, delta, effectiveScale: s.finalScale * (delta.scaleMul || 1) }));
  } catch (err) {
    arState.update((s) => ({ ...s, configError: String((err as Error).message || err) }));
  }
}

async function requestSensorPermissions(): Promise<boolean> {
  let ok = false;
  try {
    const DOE = (window as any).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      ok = (await DOE.requestPermission()) === 'granted';
    } else {
      ok = true; // 許可不要のブラウザ
    }
  } catch (e) {
    console.warn('[controller] DeviceOrientation 許可が得られませんでした:', e);
  }
  try {
    const DME = (window as any).DeviceMotionEvent;
    if (DME && typeof DME.requestPermission === 'function') {
      await DME.requestPermission();
    }
  } catch (e) {
    console.warn('[controller] DeviceMotion 許可が得られませんでした:', e);
  }
  return ok;
}

// 設定の audio.path があれば再生(glTF は音声を持てないため別ファイル)。
function setupAudio(config: LocationConfig): void {
  const a = config.audio;
  if (!a.path) {
    arState.update((s) => ({ ...s, media: { ...s.media, audio: 'none (config.audio.path 未設定)' } }));
    return;
  }
  if (!a.autoplay) {
    arState.update((s) => ({ ...s, media: { ...s.media, audio: 'configured (autoplay=false)' } }));
    return;
  }
  const el = new Audio(withBase(a.path));
  el.loop = a.loop;
  el.volume = Math.max(0, Math.min(1, a.volume));
  el.play()
    .then(() => {
      arState.update((s) => ({ ...s, media: { ...s.media, audio: 'playing: ' + a.path } }));
    })
    .catch((e) => {
      console.warn('[controller] 音声の再生に失敗:', a.path, e);
      arState.update((s) => ({ ...s, media: { ...s.media, audio: 'error: ' + (e?.message || e) } }));
    });
  audioEl = el;
}

/** 「ARを開始」タップで呼ぶ。失敗時は arState.fatalError にメッセージを入れる。 */
export function startExperience(): void {
  const config = get(arState).config;
  if (!config) return;

  // セキュアコンテキスト確認: http://192.168.x.x のような生HTTPだと
  // getUserMedia(カメラ)も方位センサーもブラウザにブロックされる。
  if (!window.isSecureContext) {
    arState.update((s) => ({
      ...s,
      fatalError:
        'このURLは安全な接続(HTTPS)ではないため、カメラと方位センサーを使えません。\n' +
        '次のいずれかで開いてください:\n' +
        '・トンネルの https URL(例: https://xxxxx.trycloudflare.com)\n' +
        '・http://localhost:5173(PCの場合)\n\n' +
        '現在のURL: ' + location.href,
    }));
    return;
  }

  arState.update((s) => ({ ...s, started: true }));

  buildAR(config);
  setupAudio(config);

  // 続けて方位センサー許可(iOS)。許可後にセンサー検出をやり直す。
  requestSensorPermissions().then((granted) => {
    if (granted && scene) scene.reconnectOrientation();
  });
}

function buildAR(config: LocationConfig): void {
  logConfigSnapshot(config);

  arState.update((s) => ({
    ...s,
    stage: { camera: 'pending', gps: 'waiting', model: 'loading', camError: null },
  }));

  scene = new LocationScene({
    gpsMinDistance: config.smoothing.ignoreSmallGpsMovementMeters,
    gpsMinAccuracy: config.smoothing.gpsMinAccuracy,
  });

  // カメラ起動の成否(生HTTP/権限拒否などで失敗したら理由を表示)。
  scene.onWebcamStatus((s) => {
    if (s.ok) {
      arState.update((st) => ({ ...st, stage: { ...st.stage, camera: 'ok' } }));
    } else {
      arState.update((st) => ({
        ...st,
        stage: { ...st.stage, camera: 'error', camError: `${s.code || 'error'}: ${s.message || ''}` },
      }));
    }
  });

  // GPS 取得状況(モデルは GPS 原点が決まるまで配置されない)。
  scene.onGpsUpdate((pos) => {
    const originReady = scene!.isOriginReady;
    arState.update((st) => ({
      ...st,
      stage: { ...st.stage, gps: originReady ? 'ready' : 'waiting' },
      sensor: { ...st.sensor, originReady, gpsAccuracy: pos.accuracy },
    }));
  });

  if (config.debug) {
    addGroundGrid(scene.threeScene);
    scene.onOrientationStatus((s) => {
      arState.update((st) => ({ ...st, sensor: { ...st.sensor, orientation: s } }));
    });
  }

  loadModel(config);
}

function loadModel(config: LocationConfig): void {
  const loader = new GLTFLoader();
  loader.load(
    withBase(config.modelPath),
    (gltf) => {
      onModelLoaded(config, gltf);
      arState.update((st) => ({ ...st, stage: { ...st.stage, model: 'loaded' } }));
    },
    undefined,
    (err) => {
      console.error('[controller] モデル読み込み失敗:', config.modelPath, err);
      arState.update((st) => ({ ...st, stage: { ...st.stage, model: 'error' } }));
    }
  );
}

function onModelLoaded(config: LocationConfig, gltf: { scene: THREE.Object3D; animations?: THREE.AnimationClip[] }): void {
  const inner = gltf.scene;

  // 正規化(底面中央補正 + finalScale 計算)。
  const { bbox, finalScale, scaleMode } = normalizeIntoOrigin(inner, config);

  // rendering: depthTest / depthWrite を適用。
  inner.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const mesh = o as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        m.depthTest = config.rendering.depthTest;
        m.depthWrite = config.rendering.depthWrite;
      }
    }
  });

  console.info('[watergate-model] bbox(m):', {
    width: +bbox.width.toFixed(3),
    height: +bbox.height.toFixed(3),
    depth: +bbox.depth.toFixed(3),
    center: bbox.center,
  });
  console.info(
    `[watergate-model] finalScale=${finalScale.toFixed(4)} (mode=${scaleMode})`,
    scaleMode === 'targetHeight'
      ? `targetHeight=${config.targetHeightMeters}m / bboxH=${bbox.height.toFixed(3)}m`
      : `config.scale=${config.scale}`
  );

  arState.update((s) => ({
    ...s,
    bbox,
    finalScale,
    effectiveScale: finalScale * (s.delta.scaleMul || 1),
    scaleMode,
  }));

  // wrapper(base transform) ← inner(正規化済みモデル)。
  wrapper = new THREE.Group();
  wrapper.add(inner);
  applyTransform(config);

  // glTF アニメーション(水門の扉など)を再生。
  setupAnimations(config, inner, gltf.animations || []);

  if (config.debug) {
    addModelDebugVisuals(wrapper, bbox);
  }

  // anchor(GPS 配置) ← wrapper。altitude は LocationScene が世界 y に反映。
  const anchor = new THREE.Group();
  anchor.add(wrapper);
  scene!.addAtLatLon(anchor, config.latitude!, config.longitude!, config.altitude);
}

// モデルに含まれる glTF アニメーションを AnimationMixer で再生する。
function setupAnimations(config: LocationConfig, inner: THREE.Object3D, clipsAll: THREE.AnimationClip[]): void {
  const cfg = config.animation;
  arState.update((s) => ({ ...s, media: { ...s.media, animations: clipsAll.map((c) => c.name) } }));

  if (!cfg.enabled || clipsAll.length === 0) {
    if (clipsAll.length === 0) console.info('[watergate-model] アニメーションなし');
    return;
  }

  // 再生対象クリップを選択(clips=null なら全部、配列なら名前一致のみ)。
  const clips = Array.isArray(cfg.clips) ? clipsAll.filter((c) => cfg.clips!.includes(c.name)) : clipsAll;

  mixer = new THREE.AnimationMixer(inner);
  mixer.timeScale = cfg.timeScale;
  for (const clip of clips) {
    const action = mixer.clipAction(clip);
    action.loop = cfg.loop ? THREE.LoopRepeat : THREE.LoopOnce;
    if (!cfg.loop) action.clampWhenFinished = true;
    action.play();
  }
  console.info(
    '[watergate-model] animations:',
    clips.map((c) => c.name)
  );

  // ミキサー更新ループ(LocationScene の描画ループとは独立。モデルの状態だけ進める)。
  if (!animLoopRunning) {
    animLoopRunning = true;
    clock = new THREE.Clock();
    const tick = () => {
      if (mixer) mixer.update(clock!.getDelta());
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

// base transform(config) + 補正デルタ(debug時のみ非ゼロ)を wrapper に適用。
// 毎フレームではなく、設定/補正が変わった時だけ呼ぶ。
function applyTransform(config: LocationConfig): void {
  if (!wrapper) return;
  const d = get(arState).delta;
  const finalScale = get(arState).finalScale;
  const s = finalScale * (d.scaleMul || 1);

  wrapper.scale.set(s, s, s);
  wrapper.position.set(
    config.positionOffsetMeters.x + d.dx,
    config.positionOffsetMeters.y + d.dy,
    config.positionOffsetMeters.z + d.dz
  );
  const yaw = config.yawDeg + (d.dYawDeg || 0);
  wrapper.rotation.set(
    THREE.MathUtils.degToRad(config.pitchDeg),
    THREE.MathUtils.degToRad(yaw),
    THREE.MathUtils.degToRad(config.rollDeg),
    'YXZ'
  );
}

/** CorrectionControls.svelte から呼ばれる。補正デルタを反映し localStorage に保存する。 */
export function applyCorrectionDelta(delta: CorrectionDelta): void {
  const config = get(arState).config;
  if (!config) return;
  saveCorrectionDelta(delta);
  arState.update((s) => ({ ...s, delta, effectiveScale: s.finalScale * (delta.scaleMul || 1) }));
  applyTransform(config);
}

/**
 * CorrectionControls.svelte の ±ボタンから呼ばれる。次のデルタ値の計算(ステップ加算/
 * 乗算)もここで行い、コンポーネント側は key/step の受け渡しだけにする。
 */
export function bumpCorrectionDelta(key: keyof CorrectionDelta, step: number, isMul: boolean): void {
  const current = get(arState).delta;
  const next = { ...current };
  if (isMul) {
    next[key] = Math.max(0.01, +(current[key] * (1 + step)).toFixed(4));
  } else {
    next[key] = +(current[key] + step).toFixed(3);
  }
  applyCorrectionDelta(next);
}

/** CorrectionControls.svelte のリセットボタンから呼ばれる。 */
export function resetCorrectionDelta(): void {
  applyCorrectionDelta({ ...ZERO_DELTA });
}
