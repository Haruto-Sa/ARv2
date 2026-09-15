// controller.ts (手のひらAR: AR.js マーカーモード)
//
// AR計算ロジック(スケール計算)も、DOM操作(シーン構築)も、ここには書かない —
// 前者は engine.ts 内で src/lib/ のユーティリティを使って行い、後者も engine.ts の
// 責務。ここは config 読み込み・起動シーケンスの調停のみを行う「コントローラ」層。
// UI(IntroPanel.svelte)はこのモジュールが公開する関数を呼ぶだけの薄いラッパーにする。
//
// GPS用の config(heigawa-suimon.json)をそのまま読み込むが、緯度経度・anchorMode は
// 使わない(modelPath/originMode/yawDeg 等、モデルそのものの情報だけを利用する)。
// マーカーAR専用の config ファイルを新設していないのは、同じ実物を指す設定は
// 1ファイルに集約する、という既存の「configが唯一の情報源」という方針を踏襲するため。
//
// マーカー検出にはコンパス/位置情報が不要なため、Pattern B にある
// DeviceOrientation/DeviceMotion の許可要求は行わない。

import { loadLocationConfig, type LocationConfig } from '../../lib/config/locationConfig';
import { withBase } from '../../lib/paths';
import { loadAframeAndArjs, mountScene } from './engine';

function resolveLocationId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('loc') || 'heigawa-suimon';
}

/** 起動前に呼ぶ。config読み込みに失敗した場合は例外を投げる(UI側でcatchする)。 */
export async function loadInitialConfig(): Promise<LocationConfig> {
  const locationId = resolveLocationId();
  const result = await loadLocationConfig(withBase(`/config/locations/${locationId}.json`));
  if (result.issues.length) {
    // 緯度経度に関する指摘はマーカーARでは無関係なので警告のみに留める(起動は妨げない)。
    console.warn('[markerar] 設定の不足(GPS関連の指摘はマーカーARでは無視してよい):\n - ' + result.issues.join('\n - '));
  }
  return result.config;
}

/**
 * 「ARを開始」タップ後の起動シーケンス。失敗時は例外を投げる(UI側でcatchしてエラー表示する)。
 * 成功した場合、呼び出し側(IntroPanel.svelte)はイントロ画面を非表示にする。
 */
export async function startExperience(config: LocationConfig): Promise<void> {
  if (!window.isSecureContext) {
    throw new Error('このURLは安全な接続(HTTPS)ではないため、カメラを使えません。');
  }

  try {
    await loadAframeAndArjs();
  } catch (err) {
    console.error(err);
    throw new Error('A-Frame / AR.js の読み込みに失敗しました。通信環境を確認してください。');
  }

  mountScene(config);
}
