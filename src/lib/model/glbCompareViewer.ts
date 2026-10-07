/**
 * /lab/glb-compare 専用のミニマルな three.js ビューア。
 * 元ファイル/Draco圧縮/Meshopt圧縮の3バリアントを切り替えて読み込み、
 * 読み込み時間(クリック〜onLoad)・三角形数・アニメクリップ名を表示する。
 * AR配置のロジック(src/lib/model/normalizeModel.ts)とは無関係の、
 * 単純な「カメラの前にモデルを置いて回す」ビューアなので独立させている。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { withBase } from '../paths';

export type VariantId = 'original' | 'draco' | 'meshopt';

export interface VariantInfo {
  id: VariantId;
  label: string;
  path: string;
}

export const VARIANTS: VariantInfo[] = [
  { id: 'original', label: '元ファイル(無圧縮)', path: withBase('/models/suimon-kousin.glb') },
  { id: 'draco', label: 'Draco圧縮', path: withBase('/models/suimon-kousin.draco.glb') },
  { id: 'meshopt', label: 'Meshopt圧縮', path: withBase('/models/suimon-kousin.meshopt.glb') },
];

export interface LoadResult {
  loadMs: number;
  triangleCount: number;
  animationNames: string[];
}

export class GlbCompareViewer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private mixer: THREE.AnimationMixer | null = null;
  private currentRoot: THREE.Object3D | null = null;
  private clock = new THREE.Clock();
  private rafId = 0;
  private gltfLoader: GLTFLoader;
  private dracoLoader: DRACOLoader;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1c2733');

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 2.2);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(5, 10, 7);
    this.scene.add(dir);

    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath(withBase('/vendor/draco/'));

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.rafId = requestAnimationFrame(this.tick);
  }

  private resize() {
    const { clientWidth, clientHeight } = this.canvas;
    if (!clientWidth || !clientHeight) return;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }

  private tick = () => {
    const dt = this.clock.getDelta();
    this.mixer?.update(dt);
    if (this.currentRoot) this.currentRoot.rotation.y += dt * 0.25;
    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this.tick);
  };

  async load(variant: VariantInfo): Promise<LoadResult> {
    if (this.currentRoot) {
      this.scene.remove(this.currentRoot);
      this.currentRoot = null;
    }
    this.mixer = null;

    const start = performance.now();
    const gltf = await this.gltfLoader.loadAsync(variant.path);
    const loadMs = performance.now() - start;

    const root = gltf.scene;
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    root.position.sub(center);

    const radius = Math.max(size.x, size.y, size.z) * 0.65 || 1;
    this.camera.position.set(radius * 0.9, radius * 0.6, radius * 1.3);
    this.camera.lookAt(0, 0, 0);

    let triangleCount = 0;
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if ((mesh as THREE.Mesh).isMesh) {
        const geom = mesh.geometry;
        const idx = geom.getIndex();
        triangleCount += (idx ? idx.count : (geom.getAttribute('position')?.count ?? 0)) / 3;
      }
    });

    const animationNames = gltf.animations.map((a) => a.name);
    if (gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(root);
      for (const clip of gltf.animations) {
        this.mixer.clipAction(clip).play();
      }
    }

    this.scene.add(root);
    this.currentRoot = root;

    return { loadMs, triangleCount: Math.round(triangleCount), animationNames };
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    this.renderer.dispose();
    this.dracoLoader.dispose();
  }
}
