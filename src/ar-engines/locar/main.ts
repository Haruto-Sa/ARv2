// main.ts (Pattern A: LocAR) — ARv2 の src/main.js を移植。
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
import { LocationScene } from './engine';
import { loadLocationConfig, type LocationConfig } from '../../lib/config/locationConfig';
import { normalizeIntoOrigin, type BoundingBox } from '../../lib/model/normalizeModel';
import { withBase } from '../../lib/paths';
import {
  addModelDebugVisuals,
  addGroundGrid,
  createInfoPanel,
  renderInfoPanel,
  logConfigSnapshot,
} from './debugHelpers';
import { createCorrectionUI, type CorrectionDelta } from './correctionUI';

const ZERO_DELTA: CorrectionDelta = { dx: 0, dz: 0, dy: 0, dYawDeg: 0, scaleMul: 1 };

type ScaleMode = 'targetHeight' | 'scale';

type Stage = {
  camera: 'pending' | 'ok' | 'error';
  gps: 'waiting' | 'ready';
  model: 'loading' | 'loaded' | 'error';
  camError: string | null;
};

const state: {
  config: LocationConfig | null;
  issues: string[];
  scene: LocationScene | null;
  wrapper: THREE.Group | null;
  bbox: BoundingBox | null;
  finalScale: number;
  scaleMode: ScaleMode;
  delta: CorrectionDelta;
  panel: HTMLDivElement | null;
  status: HTMLElement | null;
  stage: Stage;
  sensor: { originReady: boolean; gpsAccuracy: number | null; orientation: string };
  mixer: THREE.AnimationMixer | null;
  clock: THREE.Clock | null;
  animLoopRunning: boolean;
  audioEl: HTMLAudioElement | null;
  media: { animations: string[]; audio: string };
} = {
  config: null,
  issues: [],
  scene: null,
  wrapper: null,
  bbox: null,
  finalScale: 1,
  scaleMode: 'scale',
  delta: { ...ZERO_DELTA },
  panel: null,
  status: null,
  stage: { camera: 'pending', gps: 'waiting', model: 'loading', camError: null },
  sensor: { originReady: false, gpsAccuracy: null, orientation: 'pending' },
  mixer: null,
  clock: null,
  animLoopRunning: false,
  audioEl: null,
  media: { animations: [], audio: 'none' },
};

function resolveLocationId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('loc') || 'heigawa-suimon';
}

export async function bootLocAR(): Promise<void> {
  const locationId = resolveLocationId();

  try {
    const result = await loadLocationConfig(withBase(`/config/locations/${locationId}.json`));
    state.config = result.config;
    state.issues = result.issues;
  } catch (err) {
    console.error(err);
    showFatal(String((err as Error).message || err));
    return;
  }

  if (state.issues.length) {
    console.warn('[main] 設定の不足:\n - ' + state.issues.join('\n - '));
    const warn = document.getElementById('intro-warn');
    if (warn) {
      warn.hidden = false;
      warn.textContent = '⚠ ' + state.issues.join(' / ');
    }
  }

  const btn = document.getElementById('start-ar');
  if (btn) btn.addEventListener('click', onStart, { once: true });
}

function onStart(): void {
  const starting = document.getElementById('starting');
  if (starting) starting.hidden = false;

  // セキュアコンテキスト確認: http://192.168.x.x のような生HTTPだと
  // getUserMedia(カメラ)も方位センサーもブラウザにブロックされる。
  // localhost か https(トンネル)で開く必要がある。
  if (!window.isSecureContext) {
    showFatal(
      'このURLは安全な接続(HTTPS)ではないため、カメラと方位センサーを使えません。\n' +
        '次のいずれかで開いてください:\n' +
        '・トンネルの https URL(例: https://xxxxx.trycloudflare.com)\n' +
        '・http://localhost:5173(PCの場合)\n\n' +
        '現在のURL: ' + location.href
    );
    return;
  }

  // 先に AR を構築(カメラ getUserMedia をユーザー操作の中で直接起動する)。
  buildAR();

  // 音声はユーザー操作(このタップ)の中で再生開始する(自動再生ブロック回避)。
  setupAudio();

  // 続けて方位センサー許可(iOS)。許可後にセンサー検出をやり直す。
  requestSensorPermissions().then((granted) => {
    if (granted && state.scene) state.scene.reconnectOrientation();
  });

  const intro = document.getElementById('intro');
  if (intro) intro.style.display = 'none';
}

// 設定の audio.path があれば再生(glTF は音声を持てないため別ファイル)。
function setupAudio(): void {
  const a = state.config!.audio;
  if (!a.path) {
    state.media.audio = 'none (config.audio.path 未設定)';
    return;
  }
  if (!a.autoplay) {
    state.media.audio = 'configured (autoplay=false)';
    return;
  }
  const el = new Audio(withBase(a.path));
  el.loop = a.loop;
  el.volume = Math.max(0, Math.min(1, a.volume));
  el.play()
    .then(() => {
      state.media.audio = 'playing: ' + a.path;
      if (state.config!.debug) updatePanel();
    })
    .catch((e) => {
      console.warn('[main] 音声の再生に失敗:', a.path, e);
      state.media.audio = 'error: ' + (e?.message || e);
      if (state.config!.debug) updatePanel();
    });
  state.audioEl = el;
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
    console.warn('[main] DeviceOrientation 許可が得られませんでした:', e);
  }
  try {
    const DME = (window as any).DeviceMotionEvent;
    if (DME && typeof DME.requestPermission === 'function') {
      await DME.requestPermission();
    }
  } catch (e) {
    console.warn('[main] DeviceMotion 許可が得られませんでした:', e);
  }
  return ok;
}

function buildAR(): void {
  const config = state.config!;
  logConfigSnapshot(config);

  // 常時表示の状態オーバーレイ(カメラ/GPS/モデルの進行と失敗を可視化)。
  state.status = createStatusOverlay('カメラを起動中…');
  state.stage = { camera: 'pending', gps: 'waiting', model: 'loading', camError: null };

  state.scene = new LocationScene({
    gpsMinDistance: config.smoothing.ignoreSmallGpsMovementMeters,
    gpsMinAccuracy: config.smoothing.gpsMinAccuracy,
  });

  // カメラ起動の成否(生HTTP/権限拒否などで失敗したら理由を表示)。
  state.scene.onWebcamStatus((s) => {
    if (s.ok) {
      state.stage.camera = 'ok';
    } else {
      state.stage.camera = 'error';
      state.stage.camError = `${s.code || 'error'}: ${s.message || ''}`;
    }
    updateStatus();
  });

  // GPS 取得状況(モデルは GPS 原点が決まるまで配置されない)。
  state.scene.onGpsUpdate((pos) => {
    state.stage.gps = state.scene!.isOriginReady ? 'ready' : 'waiting';
    state.sensor.originReady = state.scene!.isOriginReady;
    state.sensor.gpsAccuracy = pos.accuracy;
    updateStatus();
    if (config.debug) updatePanel();
  });

  if (config.debug) {
    addGroundGrid(state.scene.threeScene);
    state.panel = createInfoPanel();
    state.scene.onOrientationStatus((s) => {
      state.sensor.orientation = s;
      updatePanel();
    });
    createCorrectionUI({
      debug: true,
      onChange: (delta) => {
        state.delta = delta;
        applyTransform();
        updatePanel();
      },
    });
  }

  loadModel();
}

function loadModel(): void {
  const config = state.config!;
  const loader = new GLTFLoader();
  loader.load(
    withBase(config.modelPath),
    (gltf) => {
      state.stage.model = 'loaded';
      onModelLoaded(gltf);
      updateStatus();
    },
    undefined,
    (err) => {
      console.error('[main] モデル読み込み失敗:', config.modelPath, err);
      state.stage.model = 'error';
      updateStatus();
    }
  );
}

// カメラ/GPS/モデルの状態を1つのオーバーレイにまとめて表示。全部OKなら消す。
function updateStatus(): void {
  if (!state.status) return;
  const st = state.stage;

  if (st.camera === 'error') {
    state.status.style.color = '#fbb';
    state.status.textContent =
      'カメラを起動できませんでした(' + st.camError + ')。\n' +
      'https(トンネル) か localhost で開き、カメラを許可してください。';
    return;
  }
  if (st.model === 'error') {
    state.status.style.color = '#fbb';
    state.status.textContent = 'モデルの読み込みに失敗しました: ' + state.config!.modelPath;
    return;
  }

  state.status.style.color = '#dff';
  const parts: string[] = [];
  if (st.camera !== 'ok') parts.push('カメラ起動中…');
  if (st.model !== 'loaded') parts.push('モデル読み込み中…');
  if (st.gps !== 'ready') parts.push('GPS取得中…(屋外で空が見える場所が有利)');

  if (parts.length === 0) {
    // 全部そろった → オーバーレイを消す。
    state.status.remove();
    state.status = null;
    return;
  }
  state.status.textContent = parts.join('\n');
}

function onModelLoaded(gltf: { scene: THREE.Object3D; animations?: THREE.AnimationClip[] }): void {
  const config = state.config!;
  const inner = gltf.scene;

  // オーバーレイの表示/非表示は updateStatus() が一括管理する(ここでは消さない)。

  // 正規化(底面中央補正 + finalScale 計算)。
  const { bbox, finalScale, scaleMode } = normalizeIntoOrigin(inner, config);
  state.bbox = bbox;
  state.finalScale = finalScale;
  state.scaleMode = scaleMode;

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

  // wrapper(base transform) ← inner(正規化済みモデル)。
  state.wrapper = new THREE.Group();
  state.wrapper.add(inner);
  applyTransform();

  // glTF アニメーション(水門の扉など)を再生。
  setupAnimations(inner, gltf.animations || []);

  if (config.debug) {
    addModelDebugVisuals(state.wrapper, bbox);
    updatePanel();
  }

  // anchor(GPS 配置) ← wrapper。altitude は LocationScene が世界 y に反映。
  const anchor = new THREE.Group();
  anchor.add(state.wrapper);
  state.scene!.addAtLatLon(anchor, config.latitude!, config.longitude!, config.altitude);
}

// モデルに含まれる glTF アニメーションを AnimationMixer で再生する。
function setupAnimations(inner: THREE.Object3D, clipsAll: THREE.AnimationClip[]): void {
  const cfg = state.config!.animation;
  state.media.animations = clipsAll.map((c) => c.name);

  if (!cfg.enabled || clipsAll.length === 0) {
    if (clipsAll.length === 0) console.info('[watergate-model] アニメーションなし');
    return;
  }

  // 再生対象クリップを選択(clips=null なら全部、配列なら名前一致のみ)。
  const clips = Array.isArray(cfg.clips) ? clipsAll.filter((c) => cfg.clips!.includes(c.name)) : clipsAll;

  state.mixer = new THREE.AnimationMixer(inner);
  state.mixer.timeScale = cfg.timeScale;
  for (const clip of clips) {
    const action = state.mixer.clipAction(clip);
    action.loop = cfg.loop ? THREE.LoopRepeat : THREE.LoopOnce;
    if (!cfg.loop) action.clampWhenFinished = true;
    action.play();
  }
  console.info(
    '[watergate-model] animations:',
    clips.map((c) => c.name)
  );

  // ミキサー更新ループ(LocationScene の描画ループとは独立。モデルの状態だけ進める)。
  if (!state.animLoopRunning) {
    state.animLoopRunning = true;
    state.clock = new THREE.Clock();
    const tick = () => {
      if (state.mixer) state.mixer.update(state.clock!.getDelta());
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

// base transform(config) + 補正デルタ(debug時のみ非ゼロ)を wrapper に適用。
// 毎フレームではなく、設定/補正が変わった時だけ呼ぶ。
function applyTransform(): void {
  if (!state.wrapper) return;
  const c = state.config!;
  const d = state.delta;
  const s = state.finalScale * (d.scaleMul || 1);

  state.wrapper.scale.set(s, s, s);
  state.wrapper.position.set(
    c.positionOffsetMeters.x + d.dx,
    c.positionOffsetMeters.y + d.dy,
    c.positionOffsetMeters.z + d.dz
  );
  const yaw = c.yawDeg + (d.dYawDeg || 0);
  state.wrapper.rotation.set(
    THREE.MathUtils.degToRad(c.pitchDeg),
    THREE.MathUtils.degToRad(yaw),
    THREE.MathUtils.degToRad(c.rollDeg),
    'YXZ'
  );
}

function updatePanel(): void {
  if (!state.panel) return;
  renderInfoPanel(state.panel, {
    config: state.config!,
    bbox: state.bbox,
    finalScale: state.finalScale * (state.delta.scaleMul || 1),
    scaleMode: state.scaleMode,
    issues: state.issues,
    sensor: state.sensor,
    media: state.media,
  });
}

function createStatusOverlay(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.id = 'model-status';
  el.style.cssText = [
    'position:fixed', 'left:50%', 'top:14px', 'transform:translateX(-50%)',
    'z-index:40', 'padding:8px 14px', 'border-radius:999px',
    'background:rgba(0,0,0,0.6)', 'color:#dff', 'font:13px/1.4 system-ui',
    'pointer-events:none',
  ].join(';');
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

function showFatal(msg: string): void {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;background:#200;color:#fdd;font:14px/1.5 system-ui;text-align:center';
  el.textContent = '設定の読み込みに失敗しました: ' + msg;
  document.body.appendChild(el);
}
