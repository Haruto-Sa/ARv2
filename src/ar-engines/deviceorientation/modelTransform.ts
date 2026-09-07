// modelTransform.ts (Pattern C)
// 旧 suimonAR の modelTemplate.ts の transform 適用部分のみを移植。
// スケール計算そのものは lib/model/normalizeModel.ts の computeFinalScale
// (targetHeightMeters / scale 排他)を使う — modelTemplate.ts 側の
// 「sizeValue が実寸モードでは倍率、レガシーモードではメートル」という
// 二重定義フィールドは持ち込まない。

import * as THREE from 'three';
import type { LoadedModel } from '../../lib/model/normalizeModel';

export type TransformOptions = {
  scale: number;
  rotationDeg: number;
  /** モデル底面の追加高さ(m)。0 なら地面に接地。 */
  heightOffset: number;
};

export function applyModelTransform(obj: THREE.Object3D, template: LoadedModel, opts: TransformOptions): void {
  obj.scale.setScalar(opts.scale);
  obj.rotation.y = (opts.rotationDeg * Math.PI) / 180;
  const bottomY = template.bboxMinY * opts.scale;
  obj.position.set(0, opts.heightOffset - bottomY, 0);
}

export function prepareModelInstance(obj: THREE.Object3D): THREE.Object3D {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = false;
    }
  });
  return obj;
}
