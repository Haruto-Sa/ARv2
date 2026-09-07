// normalizeModel.js
// 読み込んだ 3D モデル(THREE.Object3D)を Box3 で計測し、
//  - originMode === 'bottom-center' のとき底面中央を原点へ補正（底面 y=0 接地）
//  - targetHeightMeters / scale から最終スケールを決定
// する純粋関数群。距離依存スケールや毎フレーム書き換えは一切行わない。

import * as THREE from 'three';

// object3D を計測して bbox 情報（補正前）を返す。
export function measureModel(object3D) {
  const box = new THREE.Box3().setFromObject(object3D);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  return {
    width: size.x,
    height: size.y,
    depth: size.z,
    center: { x: center.x, y: center.y, z: center.z },
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
  };
}

// targetHeightMeters が非 null なら高さ基準で自動スケール、null なら config.scale を使う。
// finalScale は「1 = 1m」を意図し、モデル高さを targetHeightMeters に合わせる倍率。
export function computeFinalScale(config, bbox) {
  if (config.targetHeightMeters != null && bbox.height > 1e-6) {
    return { finalScale: config.targetHeightMeters / bbox.height, mode: 'targetHeight' };
  }
  return { finalScale: config.scale, mode: 'scale' };
}

// gltf のルート(inner)に対し底面中央補正を行い、bbox と finalScale を返す。
// scale/rotation/offset は呼び出し側が親(wrapper)に適用する（ここでは中心合わせのみ）。
export function normalizeIntoOrigin(inner, config) {
  const bbox = measureModel(inner);

  if (config.originMode === 'bottom-center') {
    // 水平中心を原点へ、底面を y=0 へ。
    inner.position.x -= bbox.center.x;
    inner.position.z -= bbox.center.z;
    inner.position.y -= bbox.min.y;
  } else {
    // 'center': 完全中心合わせ。
    inner.position.x -= bbox.center.x;
    inner.position.y -= bbox.center.y;
    inner.position.z -= bbox.center.z;
  }

  const { finalScale, mode } = computeFinalScale(config, bbox);
  return { bbox, finalScale, scaleMode: mode };
}
