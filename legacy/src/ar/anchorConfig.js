// anchorConfig.js
// watergate-anchor.json を「唯一のベース情報源」として読み込む。
// scale / position / rotation などの transform 値はここでしか供給しない。
// コード側でこれらをハードコードしてはならない。

export const DEFAULT_CONFIG_URL = '/config/watergate-anchor.json';

// 欠損キーを補完するための既定値。
// 注意: ここに「現実の実寸（緯度経度・実高さ・向き）」を書かないこと。
// 実寸の根拠が無い項目は null のままにし、設定ファイルでの入力を促す。
const DEFAULTS = Object.freeze({
  modelPath: '/models/suimon-kousin.glb',
  latitude: null,
  longitude: null,
  altitude: 0,
  yawDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
  scale: 1.0,
  targetHeightMeters: null,
  anchorMode: 'gps',
  originMode: 'bottom-center',
  positionOffsetMeters: { x: 0, y: 0, z: 0 },
  smoothing: {
    // LocAR の GPS 安定化パラメータ。
    ignoreSmallGpsMovementMeters: 3, // = gpsMinDistance（この距離未満の移動は無視）
    gpsMinAccuracy: 60, // この精度(m)より悪い GPS は採用しない
  },
  // モデルに含まれる glTF アニメーション（水門の扉など）の再生設定。
  animation: {
    enabled: true,
    loop: true,
    clips: null, // null=全クリップ再生 / 文字列配列=その名前だけ再生
    timeScale: 1.0,
  },
  // 音声。glTF/GLB は音声を埋め込めないため別ファイルで指定する。
  // path 例: "/audio/suimon.mp3"（public/audio/ に置く）。null なら音声なし。
  audio: {
    path: null,
    loop: true,
    volume: 1.0,
    autoplay: true, // 「ARを開始」タップ後に自動再生
  },
  rendering: { depthTest: true, depthWrite: true },
  debug: false,
});

function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

// 読み込んだ JSON を既定値で補完し、型を正規化して返す。
export function normalizeConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const offset = c.positionOffsetMeters && typeof c.positionOffsetMeters === 'object'
    ? c.positionOffsetMeters
    : {};
  const smoothing = c.smoothing && typeof c.smoothing === 'object' ? c.smoothing : {};
  const rendering = c.rendering && typeof c.rendering === 'object' ? c.rendering : {};
  const animation = c.animation && typeof c.animation === 'object' ? c.animation : {};
  const audio = c.audio && typeof c.audio === 'object' ? c.audio : {};

  return {
    modelPath: typeof c.modelPath === 'string' && c.modelPath ? c.modelPath : DEFAULTS.modelPath,
    latitude: numOrNull(c.latitude),
    longitude: numOrNull(c.longitude),
    altitude: num(c.altitude, DEFAULTS.altitude),
    yawDeg: num(c.yawDeg, DEFAULTS.yawDeg),
    pitchDeg: num(c.pitchDeg, DEFAULTS.pitchDeg),
    rollDeg: num(c.rollDeg, DEFAULTS.rollDeg),
    scale: num(c.scale, DEFAULTS.scale),
    targetHeightMeters: numOrNull(c.targetHeightMeters),
    anchorMode: c.anchorMode === 'gps' ? 'gps' : DEFAULTS.anchorMode,
    originMode: c.originMode === 'bottom-center' || c.originMode === 'center'
      ? c.originMode
      : DEFAULTS.originMode,
    positionOffsetMeters: {
      x: num(offset.x, 0),
      y: num(offset.y, 0),
      z: num(offset.z, 0),
    },
    smoothing: {
      ignoreSmallGpsMovementMeters: num(
        smoothing.ignoreSmallGpsMovementMeters,
        DEFAULTS.smoothing.ignoreSmallGpsMovementMeters,
      ),
      gpsMinAccuracy: num(smoothing.gpsMinAccuracy, DEFAULTS.smoothing.gpsMinAccuracy),
    },
    animation: {
      enabled: bool(animation.enabled, DEFAULTS.animation.enabled),
      loop: bool(animation.loop, DEFAULTS.animation.loop),
      clips: Array.isArray(animation.clips) ? animation.clips : DEFAULTS.animation.clips,
      timeScale: num(animation.timeScale, DEFAULTS.animation.timeScale),
    },
    audio: {
      path: typeof audio.path === 'string' && audio.path ? audio.path : DEFAULTS.audio.path,
      loop: bool(audio.loop, DEFAULTS.audio.loop),
      volume: num(audio.volume, DEFAULTS.audio.volume),
      autoplay: bool(audio.autoplay, DEFAULTS.audio.autoplay),
    },
    rendering: {
      depthTest: bool(rendering.depthTest, DEFAULTS.rendering.depthTest),
      depthWrite: bool(rendering.depthWrite, DEFAULTS.rendering.depthWrite),
    },
    debug: bool(c.debug, DEFAULTS.debug),
  };
}

// 設定として致命的に不足している点を文字列配列で返す（警告表示用）。
export function validateConfig(config) {
  const issues = [];
  if (config.anchorMode === 'gps') {
    if (config.latitude === null || config.longitude === null) {
      issues.push('latitude / longitude が未入力です。アンカー地点の実測値を設定ファイルに入力してください。');
    }
  }
  if (config.targetHeightMeters === null && (config.scale === null || config.scale <= 0)) {
    issues.push('targetHeightMeters が null かつ scale が不正です。どちらかで大きさを指定してください。');
  }
  return issues;
}

// 設定ファイルを読み込み、正規化済みオブジェクトを返す。
export async function loadAnchorConfig(url = DEFAULT_CONFIG_URL) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`設定ファイルの読み込みに失敗しました (${res.status}): ${url}`);
  }
  const raw = await res.json();
  const config = normalizeConfig(raw);
  return { config, issues: validateConfig(config) };
}
