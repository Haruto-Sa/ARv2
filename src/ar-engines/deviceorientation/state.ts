// state.ts (Pattern C)
// UI 表示専用のリアクティブ状態(Svelte store)。AR計算ロジックは一切含まない。
// three.js のインスタンス(LocationScene, rig Group, AnimationMixer 等)や
// AlignmentMetrics は controller.ts 内のモジュールローカル変数に留め、この
// store には乗せない。

import { writable } from 'svelte/store';
import { isDebugEnabled } from '../../lib/debug/overlay';

export type Stage = 'intro' | 'gps-acquiring' | 'coarse' | 'aligning' | 'anchored' | 'error';

export type ArUiState = {
  stage: Stage;
  errorMessage: string;
  gpsAccuracy: number | null;
  coarseDistance: number | null;
  coarseBearing: number | null;
  startAlignDisabled: boolean;
  hasAnim: boolean;
  animOpen: boolean;
  trackingBannerText: string;
  trackingBannerVisible: boolean;
  debugEnabled: boolean;
  debugRows: Record<string, string>;
  debugFlash: string;
};

function initialState(): ArUiState {
  return {
    stage: 'intro',
    errorMessage: '',
    gpsAccuracy: null,
    coarseDistance: null,
    coarseBearing: null,
    startAlignDisabled: true,
    hasAnim: false,
    animOpen: false,
    trackingBannerText: 'ズレを感じたら「合わせ直す」を押してください',
    trackingBannerVisible: false,
    debugEnabled: isDebugEnabled(),
    debugRows: {},
    debugFlash: '',
  };
}

export const arState = writable<ArUiState>(initialState());
