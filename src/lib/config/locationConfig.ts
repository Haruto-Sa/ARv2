/**
 * ロケーション config(public/config/locations/<id>.json)を
 * 「唯一のベース情報源」として読み込む。scale / position / rotation などの
 * transform 値はここでしか供給しない。コード側でこれらをハードコードしてはならない。
 *
 * ARv2 の src/ar/anchorConfig.js の TS 移植 + 複数ロケーション対応への拡張。
 * targetHeightMeters(絶対値) と scale(倍率)は排他的に扱う — 旧 suimonAR の
 * defaultSize(絶対値/倍率の二重の意味を持つフィールド)によるクロスページ
 * 倍率差バグを、このスキーマ自体で起こさないようにしている。
 */

export type OriginMode = 'bottom-center' | 'center';
export type AnchorMode = 'gps';

export type LocationConfig = {
  id: string;
  name: string;
  modelPath: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** 絶対値。null なら scale を使う。targetHeightMeters と scale を併用しない。 */
  targetHeightMeters: number | null;
  /** 倍率。targetHeightMeters が null のときのみ使われる。 */
  scale: number;
  anchorMode: AnchorMode;
  originMode: OriginMode;
  /** 東=+x, 北=-z (geodesy.ts の規約に合わせる)。 */
  positionOffsetMeters: { x: number; y: number; z: number };
  smoothing: {
    ignoreSmallGpsMovementMeters: number;
    gpsMinAccuracy: number;
  };
  animation: {
    enabled: boolean;
    loop: boolean;
    clips: string[] | null;
    timeScale: number;
  };
  audio: {
    path: string | null;
    loop: boolean;
    volume: number;
    autoplay: boolean;
  };
  rendering: {
    depthTest: boolean;
    depthWrite: boolean;
  };
  debug: boolean;
};

export type CatalogEntry = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  icon?: string;
  color?: string;
};

const DEFAULTS: Omit<LocationConfig, 'id' | 'name' | 'modelPath' | 'latitude' | 'longitude'> = {
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
    ignoreSmallGpsMovementMeters: 3,
    gpsMinAccuracy: 60,
  },
  animation: {
    enabled: true,
    loop: true,
    clips: null,
    timeScale: 1.0,
  },
  audio: {
    path: null,
    loop: true,
    volume: 1.0,
    autoplay: true,
  },
  rendering: { depthTest: true, depthWrite: true },
  debug: false,
};

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** 読み込んだ JSON を既定値で補完し、型を正規化して返す。 */
export function normalizeConfig(raw: unknown): LocationConfig {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const offset = c.positionOffsetMeters && typeof c.positionOffsetMeters === 'object' ? c.positionOffsetMeters : {};
  const smoothing = c.smoothing && typeof c.smoothing === 'object' ? c.smoothing : {};
  const rendering = c.rendering && typeof c.rendering === 'object' ? c.rendering : {};
  const animation = c.animation && typeof c.animation === 'object' ? c.animation : {};
  const audio = c.audio && typeof c.audio === 'object' ? c.audio : {};

  return {
    id: typeof c.id === 'string' && c.id ? c.id : 'unknown',
    name: typeof c.name === 'string' && c.name ? c.name : c.id || 'unknown',
    modelPath: typeof c.modelPath === 'string' && c.modelPath ? c.modelPath : '',
    latitude: numOrNull(c.latitude),
    longitude: numOrNull(c.longitude),
    altitude: num(c.altitude, DEFAULTS.altitude),
    yawDeg: num(c.yawDeg, DEFAULTS.yawDeg),
    pitchDeg: num(c.pitchDeg, DEFAULTS.pitchDeg),
    rollDeg: num(c.rollDeg, DEFAULTS.rollDeg),
    scale: num(c.scale, DEFAULTS.scale),
    targetHeightMeters: numOrNull(c.targetHeightMeters),
    anchorMode: c.anchorMode === 'gps' ? 'gps' : DEFAULTS.anchorMode,
    originMode: c.originMode === 'bottom-center' || c.originMode === 'center' ? c.originMode : DEFAULTS.originMode,
    positionOffsetMeters: {
      x: num(offset.x, 0),
      y: num(offset.y, 0),
      z: num(offset.z, 0),
    },
    smoothing: {
      ignoreSmallGpsMovementMeters: num(
        smoothing.ignoreSmallGpsMovementMeters,
        DEFAULTS.smoothing.ignoreSmallGpsMovementMeters
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

/** 設定として致命的に不足している点を文字列配列で返す(警告表示用)。 */
export function validateConfig(config: LocationConfig): string[] {
  const issues: string[] = [];
  if (config.anchorMode === 'gps') {
    if (config.latitude === null || config.longitude === null) {
      issues.push('latitude / longitude が未入力です。アンカー地点の実測値を設定ファイルに入力してください。');
    }
  }
  if (!config.modelPath) {
    issues.push('modelPath が未入力です。');
  }
  if (config.targetHeightMeters === null && (config.scale === null || config.scale <= 0)) {
    issues.push('targetHeightMeters が null かつ scale が不正です。どちらかで大きさを指定してください。');
  }
  // targetHeightMeters と scale の併用意図(併用モードは存在しない。scale は無視されるため誤り)。
  if (config.targetHeightMeters !== null && config.scale !== 1.0) {
    issues.push(
      `targetHeightMeters(${config.targetHeightMeters}) と scale(${config.scale}) の併用は意図しない可能性があります。` +
        'targetHeightMeters が優先され scale は無視されます — 意図しない場合は scale を 1.0 に戻すか targetHeightMeters を null にしてください。'
    );
  }
  return issues;
}

/** 設定ファイルを読み込み、正規化済みオブジェクトを返す。 */
export async function loadLocationConfig(url: string): Promise<{ config: LocationConfig; issues: string[] }> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`設定ファイルの読み込みに失敗しました (${res.status}): ${url}`);
  }
  const raw = await res.json();
  const config = normalizeConfig(raw);
  return { config, issues: validateConfig(config) };
}

/** public/config/locations/index.json のカタログを読み込む。 */
export async function loadLocationCatalog(url = '/config/locations/index.json'): Promise<CatalogEntry[]> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`ロケーション一覧の読み込みに失敗しました (${res.status}): ${url}`);
  }
  const raw = await res.json();
  return Array.isArray(raw) ? raw : [];
}
