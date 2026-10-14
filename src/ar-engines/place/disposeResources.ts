import * as THREE from 'three';

/**
 * Release owned scene assets once, including shared material/texture references.
 * Do not use this for USDZ snapshots, whose textures are shared with the live model.
 * @param root - Object tree whose owned resources are no longer needed.
 */
export function disposeResources(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const images = new Set<ImageBitmap>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Line)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => {
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) images.add(texture.image);
    texture.dispose();
  });
  images.forEach(image => image.close());
}
