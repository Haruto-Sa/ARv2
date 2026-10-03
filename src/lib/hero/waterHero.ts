import * as THREE from 'three';

/**
 * 閉伊川水門プロジェクトのランディングヒーロー背景。
 * カメラ正面の平面を水面に見立て、頂点をサイン波で揺らし、
 * フラグメントシェーダ側で dFdx/dFdy から法線を再構成してフレネル的な
 * 明暗をつける(ライトなし・ジオメトリ変形+法線近似だけの軽量実装)。
 */

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  varying vec3 vViewPosition;
  varying float vElevation;

  void main() {
    vec3 pos = position;
    float elevation =
      sin(pos.x * 0.32 + uTime * 0.28) * 0.30 +
      sin(pos.y * 0.5 - uTime * 0.38 + pos.x * 0.12) * 0.16;
    pos.z += elevation;
    vElevation = elevation;

    vec4 viewPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uColorDeep;
  uniform vec3 uColorShallow;
  uniform vec3 uColorGlint;
  uniform float uTime;

  varying vec3 vViewPosition;
  varying float vElevation;

  void main() {
    vec3 fdx = dFdx(vViewPosition);
    vec3 fdy = dFdy(vViewPosition);
    vec3 normal = normalize(cross(fdx, fdy));

    float fresnel = pow(1.0 - clamp(abs(normal.z), 0.0, 1.0), 3.0);
    vec3 base = mix(uColorDeep, uColorShallow, smoothstep(-0.28, 0.34, vElevation));
    vec3 color = mix(base, uColorGlint, fresnel * 0.16);

    float band = abs(fract(vElevation * 1.6 - uTime * 0.035) - 0.5);
    float glintBand = smoothstep(0.47, 0.5, 0.5 - band);
    color += uColorGlint * glintBand * 0.07;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export interface WaterHeroHandle {
  dispose: () => void;
}

/**
 * WebGL非対応時は null を返す(呼び出し側は静的な背景色にフォールバックする)。
 */
export function mountWaterHero(canvas: HTMLCanvasElement): WaterHeroHandle | null {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 16);

  const geometry = new THREE.PlaneGeometry(56, 32, 140, 80);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uColorDeep: { value: new THREE.Color('#081219') },
      uColorShallow: { value: new THREE.Color('#13425a') },
      uColorGlint: { value: new THREE.Color('#6fd8e8') },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);

  function resize() {
    const { clientWidth, clientHeight } = canvas;
    if (clientWidth === 0 || clientHeight === 0) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  let rafId = 0;
  let startTime = performance.now();

  function renderFrame(now: number) {
    material.uniforms.uTime.value = (now - startTime) / 1000;
    renderer.render(scene, camera);
  }

  function loop(now: number) {
    renderFrame(now);
    rafId = requestAnimationFrame(loop);
  }

  if (reduceMotion) {
    renderFrame(startTime);
  } else {
    rafId = requestAnimationFrame(loop);
  }

  function handleVisibility() {
    if (reduceMotion) return;
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    } else if (!rafId) {
      startTime = performance.now() - material.uniforms.uTime.value * 1000;
      rafId = requestAnimationFrame(loop);
    }
  }
  document.addEventListener('visibilitychange', handleVisibility);

  function dispose() {
    cancelAnimationFrame(rafId);
    document.removeEventListener('visibilitychange', handleVisibility);
    resizeObserver.disconnect();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  }

  return { dispose };
}
