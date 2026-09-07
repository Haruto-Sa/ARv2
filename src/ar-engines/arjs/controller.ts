// controller.ts (Pattern B: AR.js)
//
// AR計算ロジック(座標変換・スケール計算)は一切ここに書かない。config読み込みと
// A-Frame/AR.jsシーンの起動シーケンスのみを扱う「コントローラ」層。
// UI(IntroPanel.svelte)はこのモジュールが公開する関数を呼ぶだけの薄いラッパーにする。
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

import * as THREE from 'three';
import { loadLocationConfig, applyLatLonOverride, type LocationConfig } from '../../lib/config/locationConfig';
import { normalizeIntoOrigin } from '../../lib/model/normalizeModel';
import { withBase } from '../../lib/paths';

const AFRAME_VERSION = '1.6.0';
const ARJS_VERSION = '3.4.7';

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

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`スクリプトの読み込みに失敗しました: ${src}`));
    document.head.appendChild(script);
  });
}

async function loadAframeAndArjs(): Promise<void> {
  await loadScript(`https://aframe.io/releases/${AFRAME_VERSION}/aframe.min.js`);
  await loadScript(`https://raw.githack.com/AR-js-org/AR.js/${ARJS_VERSION}/three.js/build/ar-threex-location-only.js`);
  await loadScript(`https://raw.githack.com/AR-js-org/AR.js/${ARJS_VERSION}/aframe/build/aframe-ar.js`);
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

function mountScene(config: LocationConfig): void {
  const scene = document.createElement('a-scene') as any;
  scene.setAttribute('vr-mode-ui', 'enabled: false');
  // videoTexture: true にすると AR.js が videoTexture 用のテクスチャ平面を
  // 追加でレンダリングし、classic な video 背景と重なって「カメラ映像が二重に
  // 見える」不具合が出る(AR.js公式ドキュメントによれば videoTexture は
  // 主に1km以上離れた対象向けのオプション)。水門までの距離はその範囲外なので
  // 無効のままにする(既定値 false)。
  scene.setAttribute('arjs', 'sourceType: webcam; debugUIEnabled: false;');
  scene.setAttribute('renderer', 'antialias: true; alpha: true');
  scene.setAttribute('embedded', '');

  const camera = document.createElement('a-camera') as any;
  camera.setAttribute('gps-new-camera', `gpsMinDistance: ${config.smoothing.ignoreSmallGpsMovementMeters}`);
  scene.appendChild(camera);

  const entity = document.createElement('a-entity') as any;
  entity.setAttribute('gltf-model', `url(${withBase(config.modelPath)})`);
  entity.setAttribute('gps-new-entity-place', `latitude: ${config.latitude}; longitude: ${config.longitude}`);

  entity.addEventListener('model-loaded', (event: any) => {
    const inner: THREE.Object3D | undefined = event.detail?.model;
    if (!inner) return;
    // Pattern A と同じ正規化(底面中央補正 + targetHeightMeters/scale 排他計算)を
    // gltf-model 本体(inner)に適用し、gps-new-entity-place が動かす外側の
    // entity.object3D にはスケール・yaw だけを与える(wrapper/inner の関係が同じ)。
    const { finalScale } = normalizeIntoOrigin(inner, config);
    entity.object3D.scale.setScalar(finalScale);
    entity.object3D.rotation.y = THREE.MathUtils.degToRad(config.yawDeg);
  });

  scene.appendChild(entity);
  document.body.appendChild(scene);
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
