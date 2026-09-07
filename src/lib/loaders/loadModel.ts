/**
 * GLB を読み込み、bbox 計測込みの LoadedModel を返す共通ローダー。
 * Pattern A(独自の main.ts 内で GLTFLoader を直接使用)以外の、
 * bbox 情報(bboxMinY/bboxHeight)込みのモデルを必要とするパターン(silhouette 等)で使う。
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { measureModel, type LoadedModel } from '../model/normalizeModel';

const loader = new GLTFLoader();

export function loadModel(url: string): Promise<LoadedModel> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene || gltf.scenes?.[0];
        if (!root) {
          reject(new Error('GLB にシーンが含まれていません'));
          return;
        }
        const bbox = measureModel(root);
        resolve({
          root,
          bboxMinY: bbox.min.y,
          bboxHeight: bbox.height > 1e-6 ? bbox.height : 1,
          animations: Array.isArray(gltf.animations) ? gltf.animations : [],
        });
      },
      undefined,
      (err) => reject(err)
    );
  });
}
