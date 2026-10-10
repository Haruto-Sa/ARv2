import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createStaticExport, isHorizontalSurface, preparePlacementModel, validatePlacementConfig } from './placement';

describe('surface placement', () => {
  it('accepts upward horizontal surfaces and rejects walls, ceilings and invalid poses', () => {
    const floor = new THREE.Matrix4();
    expect(isHorizontalSurface(floor.elements, 0.9)).toBe(true);
    expect(isHorizontalSurface(new THREE.Matrix4().makeRotationX(Math.PI / 2).elements, 0.9)).toBe(false);
    expect(isHorizontalSurface(new THREE.Matrix4().makeRotationX(Math.PI).elements, 0.9)).toBe(false);
    floor.elements[12] = NaN;
    expect(isHorizontalSurface(floor.elements, 0.9)).toBe(false);
  });

  it('places the rotated model bottom on the surface and sets width in meters', () => {
    const root = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 6));
    root.position.set(8, 7, -3);
    const { model, width } = preparePlacementModel(root, 90);
    model.scale.setScalar(0.2 / width);
    const bounds = new THREE.Box3().setFromObject(model);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(0);
    expect(bounds.getSize(new THREE.Vector3()).x).toBeCloseTo(0.2);
  });

  it('bakes mirrored transforms for Quick Look without changing the source geometry', () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 6), new THREE.MeshStandardMaterial());
    source.scale.set(-1, -1, -1);
    const { model, width } = preparePlacementModel(source, 30);
    model.scale.setScalar(0.2 / width);
    const originalIndex = source.geometry.index!.array.slice();
    const expectedBounds = new THREE.Box3().setFromObject(model);
    const snapshot = createStaticExport(model);
    const actualBounds = new THREE.Box3().setFromObject(snapshot);
    expect(actualBounds.min.distanceTo(expectedBounds.min)).toBeLessThan(1e-6);
    expect(actualBounds.max.distanceTo(expectedBounds.max)).toBeLessThan(1e-6);
    const mesh = snapshot.children[0] as THREE.Mesh;
    expect(mesh.scale.toArray()).toEqual([1, 1, 1]);
    expect(mesh.geometry.index!.getX(1)).toBe(originalIndex[2]);
    expect(source.geometry.index!.array).toEqual(originalIndex);
  });

  it('rejects inverted or nonfinite placement limits', () => {
    expect(() => validatePlacementConfig({ targetWidthMeters: 0.2, minWidthMeters: 1, maxWidthMeters: 0.1, horizontalNormalThreshold: 0.9 })).toThrow();
    expect(() => validatePlacementConfig({ targetWidthMeters: NaN, minWidthMeters: 0.1, maxWidthMeters: 1, horizontalNormalThreshold: 0.9 })).toThrow();
  });

  it('keeps both sides of double-sided meshes in the static export', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
    const exported = createStaticExport(mesh).children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    expect(exported.geometry.index!.count).toBe(mesh.geometry.index!.count * 2);
    expect(exported.material.side).toBe(THREE.FrontSide);
    expect(mesh.material.side).toBe(THREE.DoubleSide);
    const normal = exported.geometry.getAttribute('normal');
    expect(normal.getZ(0)).toBe(1);
    expect(normal.getZ(normal.count - 1)).toBe(-1);
  });
});
