import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { disposeResources } from './disposeResources';

it('releases shared GPU resources only once across meshes and guide lines', () => {
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const lineMaterial = new THREE.LineBasicMaterial();
  const geometryDispose = vi.spyOn(geometry, 'dispose');
  const materialDispose = vi.spyOn(material, 'dispose');
  const textureDispose = vi.spyOn(texture, 'dispose');
  const lineDispose = vi.spyOn(lineMaterial, 'dispose');
  const root = new THREE.Group().add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material), new THREE.Line(geometry, lineMaterial));
  disposeResources(root);
  expect(geometryDispose).toHaveBeenCalledOnce();
  expect(materialDispose).toHaveBeenCalledOnce();
  expect(textureDispose).toHaveBeenCalledOnce();
  expect(lineDispose).toHaveBeenCalledOnce();
});
