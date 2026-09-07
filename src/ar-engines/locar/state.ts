// state.ts (Pattern A)
// UI 表示専用のリアクティブ状態(Svelte store)。AR計算ロジックは一切含まない
// — ここに置くのは controller.ts が更新する「表示用の値」のみ。
// three.js のインスタンス(LocationScene, wrapper Group, AnimationMixer 等)は
// controller.ts 内のモジュールローカル変数に留め、この store には乗せない。

import { writable } from 'svelte/store';
import type { LocationConfig } from '../../lib/config/locationConfig';
import type { BoundingBox } from '../../lib/model/normalizeModel';
import { ZERO_DELTA, type CorrectionDelta } from './correctionUI';

export type CameraStage = 'pending' | 'ok' | 'error';
export type GpsStage = 'waiting' | 'ready';
export type ModelStage = 'loading' | 'loaded' | 'error';
export type ScaleMode = 'targetHeight' | 'scale';

export type ArUiState = {
  config: LocationConfig | null;
  issues: string[];
  configError: string | null;
  fatalError: string | null;
  started: boolean;
  stage: { camera: CameraStage; gps: GpsStage; model: ModelStage; camError: string | null };
  sensor: { originReady: boolean; gpsAccuracy: number | null; orientation: string };
  bbox: BoundingBox | null;
  finalScale: number;
  /** finalScale * delta.scaleMul。表示用に事前計算した値(コンポーネント側では乗算しない)。 */
  effectiveScale: number;
  scaleMode: ScaleMode;
  media: { animations: string[]; audio: string };
  delta: CorrectionDelta;
};

function initialState(): ArUiState {
  return {
    config: null,
    issues: [],
    configError: null,
    fatalError: null,
    started: false,
    stage: { camera: 'pending', gps: 'waiting', model: 'loading', camError: null },
    sensor: { originReady: false, gpsAccuracy: null, orientation: 'pending' },
    bbox: null,
    finalScale: 1,
    effectiveScale: 1,
    scaleMode: 'scale',
    media: { animations: [], audio: 'none' },
    delta: { ...ZERO_DELTA },
  };
}

export const arState = writable<ArUiState>(initialState());
