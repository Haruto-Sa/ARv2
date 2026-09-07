/**
 * 読み込んだ 3D モデル(THREE.Object3D)を Box3 で計測し、
 *  - originMode === 'bottom-center' のとき底面中央を原点へ補正(底面 y=0 接地)
 *  - targetHeightMeters / scale から最終スケールを決定
 * する純粋関数群。距離依存スケールや毎フレーム書き換えは一切行わない。
 *
 * ARv2 の src/ar/normalizeModel.js の TS 移植。targetHeightMeters(絶対値)と
 * scale(倍率)を排他的に扱う設計はそのまま維持する — 旧 suimonAR の
 * defaultSize(絶対値/倍率の二重の意味を持つフィールド)によるクロスページ
 * 倍率差バグを、この設計自体で構文的に起こさないようにしている。
 */
import * as THREE from 'three';

/** GLTFLoader が返す gltf.scene 相当のロード済みモデル。silhouette.ts 等で共有する形。 */
export type LoadedModel = {
  root: THREE.Object3D;
  bboxMinY: number;
  bboxHeight: number;
  animations: THREE.AnimationClip[];
};

export type BoundingBox = {
  width: number;
  height: number;
  depth: number;
  center: { x: number; y: number; z: number };
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
};

export function measureModel(object3D: THREE.Object3D): BoundingBox {
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

export type ScaleConfig = {
  targetHeightMeters: number | null;
  scale: number;
};

export type ScaleResult = {
  finalScale: number;
  mode: 'targetHeight' | 'scale';
};

/** targetHeightMeters が非 null なら高さ基準で自動スケール、null なら scale を使う。 */
export function computeFinalScale(config: ScaleConfig, bbox: { height: number }): ScaleResult {
  if (config.targetHeightMeters != null && bbox.height > 1e-6) {
    return { finalScale: config.targetHeightMeters / bbox.height, mode: 'targetHeight' };
  }
  return { finalScale: config.scale, mode: 'scale' };
}

export type OriginMode = 'bottom-center' | 'center';

export type NormalizeResult = {
  bbox: BoundingBox;
  finalScale: number;
  scaleMode: ScaleResult['mode'];
};

/**
 * gltf のルート(inner)に対し底面中央補正を行い、bbox と finalScale を返す。
 * scale/rotation/offset は呼び出し側が親(wrapper)に適用する(ここでは中心合わせのみ)。
 */
export function normalizeIntoOrigin(
  inner: THREE.Object3D,
  config: ScaleConfig & { originMode: OriginMode }
): NormalizeResult {
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
