import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface PlacementConfig {
  targetWidthMeters: number;
  minWidthMeters: number;
  maxWidthMeters: number;
  horizontalNormalThreshold: number;
}

export function validatePlacementConfig(value: PlacementConfig): PlacementConfig {
  const { targetWidthMeters, minWidthMeters, maxWidthMeters, horizontalNormalThreshold } = value;
  if (![targetWidthMeters, minWidthMeters, maxWidthMeters, horizontalNormalThreshold].every(Number.isFinite)
    || minWidthMeters <= 0 || minWidthMeters > targetWidthMeters || targetWidthMeters > maxWidthMeters
    || horizontalNormalThreshold <= 0 || horizontalNormalThreshold > 1) {
    throw new Error('配置サイズの設定が不正です。');
  }
  return value;
}

/** Hit-test poses use their Y axis as the surface normal. Reject walls and ceilings. */
export function isHorizontalSurface(matrix: ArrayLike<number>, threshold: number): boolean {
  return matrix.length === 16 && Array.from(matrix).every(Number.isFinite) && matrix[5] >= threshold;
}

/** Width is measured after configured orientation, before scaling. Bottom rests at y=0. */
export function preparePlacementModel(root: THREE.Object3D, yawDeg: number) {
  const model = new THREE.Group();
  model.add(root);
  root.rotation.y += THREE.MathUtils.degToRad(yawDeg);
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.x) || size.x <= 1e-6) throw new Error('水門モデルの幅を取得できません。');
  const center = bounds.getCenter(new THREE.Vector3());
  root.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  return { model, width: size.x, height: size.y };
}

/** Bake mirrored GLB transforms: USDZ/Quick Look does not support negative scales. */
export function createStaticExport(model: THREE.Object3D): THREE.Group {
  model.updateWorldMatrix(true, true);
  const snapshot = new THREE.Group();
  const materials = new Map<THREE.Material, THREE.Material>();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry: THREE.BufferGeometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    if (object.matrixWorld.determinant() < 0) {
      // Baking a reflection reverses triangle winding; preserve the visible front faces.
      const index = geometry.index;
      if (index) {
        for (let i = 0; i < index.count; i += 3) {
          const second = index.getX(i + 1);
          index.setX(i + 1, index.getX(i + 2));
          index.setX(i + 2, second);
        }
      } else {
        for (const attribute of Object.values(geometry.attributes)) {
          for (let i = 0; i < attribute.count; i += 3) {
            for (let component = 0; component < attribute.itemSize; component++) {
              const second = attribute.getComponent(i + 1, component);
              attribute.setComponent(i + 1, component, attribute.getComponent(i + 2, component));
              attribute.setComponent(i + 2, component, second);
            }
          }
        }
      }
    }
    // The current GLB uses double-sided surfaces, which USDZExporter cannot encode.
    // Include reversed triangles with reversed normals so both sides remain visible.
    if (Array.isArray(object.material)) throw new Error('USDZ変換に未対応の複数マテリアルです。');
    const originalMaterial: THREE.Material = object.material;
    let exportGeometry = geometry;
    if (originalMaterial.side === THREE.DoubleSide) {
      if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i));
      const back = geometry.clone();
      const backIndex = back.index!;
      for (let i = 0; i < backIndex.count; i += 3) {
        const second = backIndex.getX(i + 1);
        backIndex.setX(i + 1, backIndex.getX(i + 2));
        backIndex.setX(i + 2, second);
      }
      const normals = back.getAttribute('normal');
      if (normals) for (let i = 0; i < normals.count; i++) normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
      const merged = mergeGeometries([geometry, back]);
      if (!merged) throw new Error('USDZ用の両面メッシュを作成できません。');
      exportGeometry = merged;
      geometry.dispose(); back.dispose();
    }
    let material = materials.get(originalMaterial);
    if (!material) {
      material = originalMaterial.clone();
      material.side = THREE.FrontSide;
      materials.set(originalMaterial, material);
    }
    snapshot.add(new THREE.Mesh(exportGeometry, material));
  });
  return snapshot;
}
