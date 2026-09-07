// controller.ts (Pattern B: AR.js)
//
// AR計算ロジック(座標変換・スケール計算)も、DOM操作(シーン構築)も、
// ここには書かない — 前者は src/lib/、後者は engine.ts の責務。
// ここは config 読み込み・権限リクエスト・起動シーケンスの調停のみを行う
// 「コントローラ」層。UI(IntroPanel.svelte)はこのモジュールが公開する
// 関数を呼ぶだけの薄いラッパーにする。
//
// 既知の制約(実機検証で要確認 — 詳細は Issue #1 参照):
//   - AR.js 公式ドキュメントは iOS の deviceorientation 絶対値取得の弱さを理由に
//     LocAR.js への移行を推奨している。iOS Safari での方位精度は Pattern A/C より
//     劣る可能性がある。
//   - positionOffsetMeters / pitchDeg / rollDeg は本パターンでは未対応
//     (yawDeg のみ反映。gps-new-entity-place は緯度経度から毎フレーム位置を
//     再計算するため、LocAR の一度きり配置と異なりローカルオフセットの
//     単純加算では frame ごとに上書きされてしまう)。
//
// <a-scene> は最初から DOM に置かず、「開始する」タップ後(iOS のモーション許可を
// 得た後)に動的生成する。他パターンと同じく、カメラ起動はユーザー操作の中で行う。

import { loadLocationConfig, applyLatLonOverride, type LocationConfig } from '../../lib/config/locationConfig';
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
    console.warn('[arjs] 設定の不足:\n - ' + result.issues.join('\n - '));
  }
  return applyLatLonOverride(result.config, new URLSearchParams(window.location.search));
}

async function requestSensorPermissions(): Promise<boolean> {
  let ok = false;
  try {
    const DOE = (window as any).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      ok = (await DOE.requestPermission()) === 'granted';
    } else {
      ok = true;
    }
  } catch (e) {
    console.warn('[arjs] DeviceOrientation 許可が得られませんでした:', e);
  }
  try {
    const DME = (window as any).DeviceMotionEvent;
    if (DME && typeof DME.requestPermission === 'function') {
      await DME.requestPermission();
    }
  } catch (e) {
    console.warn('[arjs] DeviceMotion 許可が得られませんでした:', e);
  }
  return ok;
}

/**
 * 「ARを開始」タップ後の起動シーケンス。失敗時は例外を投げる(UI側でcatchしてエラー表示する)。
 * 成功した場合、呼び出し側(IntroPanel.svelte)はイントロ画面を非表示にする。
 */
export async function startExperience(config: LocationConfig): Promise<void> {
  if (!window.isSecureContext) {
    throw new Error('このURLは安全な接続(HTTPS)ではないため、カメラと方位センサーを使えません。');
  }

  await requestSensorPermissions();
  try {
    await loadAframeAndArjs();
  } catch (err) {
    console.error(err);
    throw new Error('A-Frame / AR.js の読み込みに失敗しました。通信環境を確認してください。');
  }

  mountScene(config);
}
