// main.ts (Pattern B: AR.js 位置情報AR)
//
// A-Frame + AR.js(`gps-new-camera`/`gps-new-entity-place`)による位置情報AR。
// AR.js/LocAR は現在同じ AR-js-org 傘下だが、GPS→ワールド座標の変換実装が
// LocAR(Pattern A)とは別物のため、比較対象として意味がある。
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

function showFatal(msg: string): void {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;background:#200;color:#fdd;font:14px/1.5 system-ui;text-align:center';
  el.textContent = msg;
  document.body.appendChild(el);
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

export async function bootArjsAR(): Promise<void> {
  const locationId = resolveLocationId();
  let config: LocationConfig;
  try {
    const result = await loadLocationConfig(withBase(`/config/locations/${locationId}.json`));
    config = applyLatLonOverride(result.config, new URLSearchParams(window.location.search));
    if (result.issues.length) {
      console.warn('[arjs] 設定の不足:\n - ' + result.issues.join('\n - '));
    }
  } catch (err) {
    console.error(err);
    showFatal(String((err as Error).message || err));
    return;
  }

  const btn = document.getElementById('start-ar');
  if (!btn) return;

  btn.addEventListener(
    'click',
    async () => {
      const starting = document.getElementById('starting');
      if (starting) starting.hidden = false;

      if (!window.isSecureContext) {
        showFatal('このURLは安全な接続(HTTPS)ではないため、カメラと方位センサーを使えません。');
        return;
      }

      await requestSensorPermissions();
      try {
        await loadAframeAndArjs();
      } catch (err) {
        console.error(err);
        showFatal('A-Frame / AR.js の読み込みに失敗しました。通信環境を確認してください。');
        return;
      }

      const intro = document.getElementById('intro');
      if (intro) intro.style.display = 'none';

      mountScene(config);
    },
    { once: true }
  );
}
