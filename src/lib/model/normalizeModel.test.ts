import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { measureModel, computeFinalScale, normalizeIntoOrigin } from './normalizeModel';

function makeBox(width: number, height: number, depth: number, center: THREE.Vector3): THREE.Object3D {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.position.copy(center);
  const root = new THREE.Group();
  root.add(mesh);
  return root;
}

describe('measureModel', () => {
  it('4x8.5x2 のボックスを正しく計測する', () => {
    const obj = makeBox(4, 8.5, 2, new THREE.Vector3(10, 4.25, -3));
    const bbox = measureModel(obj);
    expect(bbox.width).toBeCloseTo(4, 6);
    expect(bbox.height).toBeCloseTo(8.5, 6);
    expect(bbox.depth).toBeCloseTo(2, 6);
    expect(bbox.center.x).toBeCloseTo(10, 6);
    expect(bbox.min.y).toBeCloseTo(0, 6);
    expect(bbox.max.y).toBeCloseTo(8.5, 6);
  });
});

describe('computeFinalScale', () => {
  it('targetHeightMeters が指定されていれば実寸に合わせたスケールを返す', () => {
    const result = computeFinalScale({ targetHeightMeters: 8.5, scale: 999 }, { height: 17 });
    expect(result.mode).toBe('targetHeight');
    expect(result.finalScale).toBeCloseTo(0.5, 6);
  });

  it('targetHeightMeters が null なら scale をそのまま使う(併用しない)', () => {
    const result = computeFinalScale({ targetHeightMeters: null, scale: 2 }, { height: 17 });
    expect(result.mode).toBe('scale');
    expect(result.finalScale).toBe(2);
  });

  it('bboxHeight がほぼ0のときは targetHeightMeters を無視して scale を使う(0除算回避)', () => {
    const result = computeFinalScale({ targetHeightMeters: 8.5, scale: 3 }, { height: 0 });
    expect(result.mode).toBe('scale');
    expect(result.finalScale).toBe(3);
  });
});

describe('normalizeIntoOrigin', () => {
  it('bottom-center: 水平中心を原点へ、底面を y=0 へ移動する', () => {
    const obj = makeBox(4, 8.5, 2, new THREE.Vector3(10, 4.25, -3));
    const { bbox, finalScale, scaleMode } = normalizeIntoOrigin(obj, {
      originMode: 'bottom-center',
      targetHeightMeters: 8.5,
      scale: 1,
    });

    const after = measureModel(obj);
    expect(after.center.x).toBeCloseTo(0, 6);
    expect(after.center.z).toBeCloseTo(0, 6);
    expect(after.min.y).toBeCloseTo(0, 6);

    expect(bbox.height).toBeCloseTo(8.5, 6);
    expect(scaleMode).toBe('targetHeight');
    expect(finalScale).toBeCloseTo(1, 6);
  });

  it('center: 完全中心合わせで原点に置く', () => {
    const obj = makeBox(4, 8.5, 2, new THREE.Vector3(10, 4.25, -3));
    normalizeIntoOrigin(obj, { originMode: 'center', targetHeightMeters: null, scale: 1 });

    const after = measureModel(obj);
    expect(after.center.x).toBeCloseTo(0, 6);
    expect(after.center.y).toBeCloseTo(0, 6);
    expect(after.center.z).toBeCloseTo(0, 6);
  });
});
