// engine.ts (Pattern B: AR.js)
//
// A-Frame/AR.js の <script> 読み込みと <a-scene> の構築のみを扱う。UI(DOM
// テキスト・ボタン)は一切扱わない — AR.js自体がカスタム要素(<a-scene> 等)を
// 通じてしか初期化できないライブラリのため、この「シーン構築」が Pattern A/C の
// engine.ts 相当の役割を担う。controller.ts からのみ呼ばれる。

import * as THREE from 'three';
import { normalizeIntoOrigin } from '../../lib/model/normalizeModel';
import { withBase } from '../../lib/paths';
import type { LocationConfig } from '../../lib/config/locationConfig';

const AFRAME_VERSION = '1.6.0';
const ARJS_VERSION = '3.4.7';

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

export async function loadAframeAndArjs(): Promise<void> {
  await loadScript(`https://aframe.io/releases/${AFRAME_VERSION}/aframe.min.js`);
  await loadScript(`https://raw.githack.com/AR-js-org/AR.js/${ARJS_VERSION}/three.js/build/ar-threex-location-only.js`);
  await loadScript(`https://raw.githack.com/AR-js-org/AR.js/${ARJS_VERSION}/aframe/build/aframe-ar.js`);
}

export function mountScene(config: LocationConfig): void {
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
