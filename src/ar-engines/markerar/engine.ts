// engine.ts (手のひらAR: AR.js マーカーモード)
//
// A-Frame/AR.js の <script> 読み込みと <a-scene> の構築のみを扱う。UI(DOM
// テキスト・ボタン)は一切扱わない。Pattern B(src/ar-engines/arjs/engine.ts)と
// 同じ CDN 方式・同じバージョンで A-Frame/AR.js を読み込むが、GPS 用の
// `-location-only` スクリプトは不要なため読み込まない。controller.ts からのみ呼ばれる。

import * as THREE from 'three';
import { normalizeIntoOrigin } from '../../lib/model/normalizeModel';
import { withBase } from '../../lib/paths';
import type { LocationConfig } from '../../lib/config/locationConfig';

const AFRAME_VERSION = '1.6.0';
const ARJS_VERSION = '3.4.7';

// マーカーAR(手のひらサイズの卓上表示)向けの目標サイズ。config の
// targetHeightMeters(GPS実寸、例: 5m)をそのまま使うと、マーカー1枚分の
// スケール感に対してモデルが巨大になってしまうため、マーカーAR専用の
// 小さな目標値を別に持つ(normalizeIntoOrigin の targetHeightMeters は
// 「メートル」という単位に縛られた値ではなく、AR.js のマーカー座標空間上での
// 目標サイズとして再利用する)。
const MARKER_TARGET_HEIGHT = 0.15;

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
  await loadScript(`https://raw.githack.com/AR-js-org/AR.js/${ARJS_VERSION}/aframe/build/aframe-ar.js`);
}

export function mountScene(config: LocationConfig): void {
  const scene = document.createElement('a-scene') as any;
  scene.setAttribute('vr-mode-ui', 'enabled: false');
  scene.setAttribute('embedded', '');
  scene.setAttribute(
    'arjs',
    'sourceType: webcam; detectionMode: mono_and_matrix; matrixCodeType: 3x3; debugUIEnabled: false;'
  );
  scene.setAttribute('renderer', 'antialias: true; alpha: true');

  const marker = document.createElement('a-marker') as any;
  marker.setAttribute('preset', 'hiro');

  const entity = document.createElement('a-entity') as any;
  entity.setAttribute('gltf-model', `url(${withBase(config.modelPath)})`);

  entity.addEventListener('model-loaded', (event: any) => {
    const inner: THREE.Object3D | undefined = event.detail?.model;
    if (!inner) return;
    // targetHeightMeters を非nullにしているため、computeFinalScale() の分岐により
    // scale は評価されず finalScale の算出には一切使われない(ScaleConfig型が必須
    // フィールドとして要求するための埋め値。1.0 = 「scale未使用」を表す唯一の値で、
    // targetHeightMeters/scale の併用禁止ルールが警告対象とする「非nullのtargetHeightMeters
    // とscale!==1.0の組み合わせ」には該当しない)。
    const { finalScale } = normalizeIntoOrigin(inner, {
      targetHeightMeters: MARKER_TARGET_HEIGHT,
      scale: 1,
      originMode: config.originMode,
    });
    entity.object3D.scale.setScalar(finalScale);
    entity.object3D.rotation.y = THREE.MathUtils.degToRad(config.yawDeg);
  });

  marker.appendChild(entity);
  scene.appendChild(marker);

  const camera = document.createElement('a-entity') as any;
  camera.setAttribute('camera', '');
  scene.appendChild(camera);

  document.body.appendChild(scene);
}
