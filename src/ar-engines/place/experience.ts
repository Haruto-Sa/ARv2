import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { loadModel } from '../../lib/loaders/loadModel';
import { loadLocationConfig } from '../../lib/config/locationConfig';
import { withBase } from '../../lib/paths';
import { createStaticExport, isHorizontalSurface, preparePlacementModel, validatePlacementConfig, type PlacementConfig } from './placement';

export async function mountPlacementExperience(root: HTMLElement) {
  const element = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const status = element('status');
  const start = element<HTMLButtonElement>('start-ar');
  const place = element<HTMLButtonElement>('place');
  const reset = element<HTMLButtonElement>('reset');
  const end = element<HTMLButtonElement>('end-ar');
  const widthInput = element<HTMLInputElement>('width');
  const rotationInput = element<HTMLInputElement>('rotation');
  const animation = element<HTMLButtonElement>('animation');
  const quicklook = element<HTMLAnchorElement>('quicklook');
  const prepareQuicklook = element<HTMLButtonElement>('prepare-quicklook');
  const viewerOnly = root.dataset.viewer === 'true';
  const say = (message: string) => { if (status.textContent !== message) status.textContent = message; };
  let renderer: THREE.WebGLRenderer | undefined;
  let session: XRSession | undefined;
  let hitSource: XRHitTestSource | undefined;
  let anchor: XRAnchor | undefined;
  let disposed = false;
  let generation = 0;
  let quicklookUrl: string | undefined;
  let controls: OrbitControls | undefined;
  let mixer: THREE.AnimationMixer | undefined;
  let camera: THREE.PerspectiveCamera | undefined;
  const scene = new THREE.Scene();
  const placement = new THREE.Group();
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.045, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6affe0, side: THREE.DoubleSide }));
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(placement, reticle);

  function dispose() {
    if (disposed) return;
    disposed = true;
    generation++;
    hitSource?.cancel();
    anchor?.delete();
    void session?.end().catch(() => {});
    renderer?.setAnimationLoop(null);
    controls?.dispose();
    mixer?.stopAllAction();
    const textures = new Set<THREE.Texture>();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        material.dispose();
      }
    });
    textures.forEach((texture) => texture.dispose());
    renderer?.dispose();
    if (quicklookUrl) URL.revokeObjectURL(quicklookUrl);
    window.removeEventListener('resize', resize);
  }
  function resize() {
    renderer?.setSize(root.clientWidth, root.clientHeight);
    if (camera) { camera.aspect = root.clientWidth / root.clientHeight; camera.updateProjectionMatrix(); }
  }
  window.addEventListener('pagehide', dispose, { once: true });

  try {
    // Capability checks never request camera permission. AR starts only on a user tap.
    const supportsAR = !viewerOnly && window.isSecureContext && !!navigator.xr
      && await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
    const supportsQuicklook = quicklook.relList.supports('ar');
    const mobile = navigator.maxTouchPoints > 0 && window.matchMedia('(any-pointer: coarse)').matches;
    if (!viewerOnly && (!mobile || (!supportsAR && !supportsQuicklook))) {
      window.location.replace(withBase('/viewer'));
      dispose();
      return;
    }
    root.dataset.mode = viewerOnly ? 'viewer' : 'camera-intro';
    element('camera-notice').hidden = viewerOnly;
    start.hidden = !supportsAR;
    element('viewer-link').hidden = viewerOnly;
    const [{ config }, placementResponse] = await Promise.all([
      loadLocationConfig(withBase('/config/locations/heigawa-suimon.json')),
      fetch(withBase('/config/placement.json')),
    ]);
    if (!placementResponse.ok) throw new Error('配置設定を読み込めません。');
    const settings = validatePlacementConfig(await placementResponse.json() as PlacementConfig);
    const loaded = await loadModel(withBase(config.modelPath));
    const { model, width, height } = preparePlacementModel(loaded.root, config.yawDeg);
    placement.add(model);
    if (disposed) { disposed = false; dispose(); return; }
    camera = new THREE.PerspectiveCamera(50, root.clientWidth / root.clientHeight, 0.01, 1000);
    const viewCamera = camera;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element('viewport').appendChild(renderer.domElement);
    resize();
    scene.background = new THREE.Color(0x102535);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x7f9aad, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(2, 4, 3);
    scene.add(light);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    widthInput.min = String(settings.minWidthMeters);
    widthInput.max = String(settings.maxWidthMeters);
    widthInput.value = String(settings.targetWidthMeters);
    const applyWidth = () => {
      model.scale.setScalar(Number(widthInput.value) / width);
      element('width-value').textContent = `${Math.round(Number(widthInput.value) * 100)}cm`;
    };
    applyWidth();
    const preview = () => {
      placement.visible = true;
      placement.position.set(0, 0, 0);
      placement.quaternion.identity();
      const h = height * model.scale.x;
      viewCamera.position.set(0.3, Math.max(h, 0.2), 0.4);
      controls!.target.set(0, h / 2, 0);
      controls!.enabled = true;
      controls!.update();
      scene.background = new THREE.Color(0x102535);
    };
    preview();
    widthInput.addEventListener('input', applyWidth);
    rotationInput.addEventListener('input', () => { model.rotation.y = THREE.MathUtils.degToRad(Number(rotationInput.value)); });
    const clips = loaded.animations.filter((clip) => !config.animation.clips || config.animation.clips.includes(clip.name));
    if (config.animation.enabled && clips.length) {
      mixer = new THREE.AnimationMixer(loaded.root);
      mixer.timeScale = config.animation.timeScale;
      for (const clip of clips) {
        const action = mixer.clipAction(clip);
        action.setLoop(config.animation.loop ? THREE.LoopRepeat : THREE.LoopOnce, config.animation.loop ? Infinity : 1);
        action.clampWhenFinished = true;
        action.play();
      }
      animation.addEventListener('click', () => {
        mixer!.timeScale = mixer!.timeScale === 0 ? config.animation.timeScale : 0;
        animation.textContent = mixer!.timeScale === 0 ? '扉の動きを再生' : '扉の動きを一時停止';
      });
    } else animation.hidden = true;
    element<HTMLFieldSetElement>('model-controls').disabled = false;
    start.disabled = false;
    prepareQuicklook.disabled = false;
    say(viewerOnly ? '水門を回して見てみましょう。' : supportsAR ? '準備ができました。「カメラを起動」を押してください。' : 'カメラ起動用のモデルを準備しています…');

    // Quick Look provides native plane detection on supported browsers, independently of WebXR.
    // USDZExporter exports the static pose only; interactive animation stays in the web viewer.
    const prepareNativeAR = async () => {
      prepareQuicklook.disabled = true;
      say('平面AR用のモデルを準備しています…');
      try {
        const exported = createStaticExport(model);
        let data: Uint8Array;
        try {
          data = await new USDZExporter().parseAsync(exported, { quickLookCompatible: true, maxTextureSize: 1024 });
        } finally {
          const exportMaterials = new Set<THREE.Material>();
          exported.traverse((object) => {
            if (object instanceof THREE.Mesh) { object.geometry.dispose(); exportMaterials.add(object.material); }
          });
          exportMaterials.forEach((material) => material.dispose());
        }
        if (disposed) return;
        quicklookUrl = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'model/vnd.usdz+zip' }));
        quicklook.href = `${quicklookUrl}#canonicalWebPageURL=${encodeURIComponent(new URL(withBase('/ar/place'), window.location.origin).href)}`;
        quicklook.hidden = false;
        prepareQuicklook.hidden = true;
        say('「カメラを起動」でARを開きます。静止モデルを配置します。OSの画面で「AR」を選択してください。');
      } catch {
        prepareQuicklook.hidden = false;
        prepareQuicklook.disabled = false;
        say('平面AR用モデルの準備に失敗しました。もう一度お試しください。');
      }
    };
    prepareQuicklook.addEventListener('click', prepareNativeAR);
    if (!viewerOnly && supportsQuicklook && !supportsAR) void prepareNativeAR();

    let queuedPlacement = false;
    let placed = false;
    const requestPlacement = () => { if (!placed && reticle.visible) queuedPlacement = true; };
    place.addEventListener('click', requestPlacement);
    element('overlay').addEventListener('beforexrselect', (event) => event.preventDefault());
    reset.addEventListener('click', () => {
      generation++;
      anchor?.delete(); anchor = undefined;
      placed = false;
      queuedPlacement = false;
      placement.visible = false;
      reset.hidden = true; place.hidden = false; place.disabled = true;
      say('机や床にカメラを向けて、ゆっくり動かしてください。');
    });
    end.addEventListener('click', () => { void session?.end(); });
    element<HTMLAnchorElement>('home').addEventListener('click', (event) => {
      if (!session) return;
      event.preventDefault();
      const destination = element<HTMLAnchorElement>('home').href;
      void session.end().catch(() => {}).finally(() => window.location.assign(destination));
    });
    start.addEventListener('click', async () => {
      start.disabled = true;
      let requested: XRSession | undefined;
      try {
        requested = await navigator.xr!.requestSession('immersive-ar', {
          requiredFeatures: ['hit-test', 'local', 'dom-overlay'],
          optionalFeatures: ['anchors'], domOverlay: { root: element('overlay') },
        });
        if (disposed) { await requested.end(); return; }
        session = requested;
        session.addEventListener('end', () => {
          generation++;
          hitSource?.cancel(); hitSource = undefined;
          anchor?.delete(); anchor = undefined;
          session = undefined;
          placed = false; queuedPlacement = false; reticle.visible = false;
          start.hidden = false; start.disabled = false;
          place.hidden = true; reset.hidden = true; end.hidden = true;
          root.dataset.mode = 'camera-intro';
          element('camera-notice').hidden = false;
          element('intro').hidden = viewerOnly; element('viewer-help').hidden = false;
          if (!disposed) preview();
          say('ARを終了しました。もう一度開始できます。');
        }, { once: true });
        const viewerSpace = await session.requestReferenceSpace('viewer');
        if (!session.requestHitTestSource) throw new Error('平面検出に対応していません。');
        hitSource = await session.requestHitTestSource({ space: viewerSpace, entityTypes: ['plane'] });
        if (!hitSource) throw new Error('平面検出を開始できません。');
        await renderer!.xr.setSession(session);
        scene.background = null;
        root.dataset.mode = 'camera';
        element('camera-notice').hidden = true;
        controls!.enabled = false;
        placement.visible = false;
        start.hidden = true; place.hidden = false; end.hidden = false;
        element('intro').hidden = true; element('viewer-help').hidden = true;
        session.addEventListener('select', requestPlacement);
        say('机や床にカメラを向けて、ゆっくり動かしてください。');
      } catch (error) {
        if (requested) await requested.end().catch(() => {});
        start.disabled = false;
        const denied = error instanceof DOMException && error.name === 'NotAllowedError';
        say(denied ? 'カメラ・ARの許可が必要です。ブラウザのサイト設定で許可して、もう一度開始してください。'
          : '平面ARを開始できませんでした。対応端末・HTTPS接続をご確認ください。3D表示は引き続き使えます。');
      }
    });
    let previousTime: number | undefined;
    renderer.setAnimationLoop((time: number, frame?: XRFrame) => {
      const delta = previousTime === undefined ? 0 : Math.min((time - previousTime) / 1000, 0.1);
      previousTime = time;
      mixer?.update(delta);
      if (!session) controls!.update();
      if (session && frame && hitSource) {
        const referenceSpace = renderer!.xr.getReferenceSpace();
        if (referenceSpace) {
          if (placed) {
            reticle.visible = false;
            if (anchor) {
              const pose = frame.getViewerPose(referenceSpace) ? frame.getPose(anchor.anchorSpace, referenceSpace) : null;
              placement.visible = !!pose;
              if (pose) {
                placement.position.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
                placement.quaternion.set(pose.transform.orientation.x, pose.transform.orientation.y, pose.transform.orientation.z, pose.transform.orientation.w);
              }
              say(pose ? '配置しました。近づいたり、周りから見たりできます。' : '位置を見失いました。置いた場所にカメラを戻してください。');
            } else {
              placement.visible = !!frame.getViewerPose(referenceSpace);
              say(placement.visible ? '配置しました。近づいたり、周りから見たりできます。' : '追跡を再開するため、周囲をゆっくり映してください。');
            }
          } else {
            const hit = frame.getHitTestResults(hitSource).find((result) => {
              const pose = result.getPose(referenceSpace);
              return pose && isHorizontalSurface(pose.transform.matrix, settings.horizontalNormalThreshold);
            });
            const pose = hit?.getPose(referenceSpace);
            reticle.visible = !!pose;
            place.disabled = !pose;
            if (pose) reticle.matrix.fromArray(pose.transform.matrix);
            say(pose ? '円の場所に水門を置けます。画面をタップしてください。' : '机や床を探しています。明るい場所で、模様のある面をゆっくり映してください。');
            if (queuedPlacement && pose && hit) {
              placed = true;
              placement.position.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
              placement.quaternion.set(pose.transform.orientation.x, pose.transform.orientation.y, pose.transform.orientation.z, pose.transform.orientation.w);
              placement.visible = true; reticle.visible = false;
              place.hidden = true; reset.hidden = false;
              const currentGeneration = ++generation;
              // Invoke inside the active frame; stale promises must not resurrect reset anchors.
              if (hit.createAnchor) void hit.createAnchor().then((created) => {
                if (disposed || generation !== currentGeneration || !session) created.delete();
                else anchor = created;
              }).catch(() => { /* Local reference-space placement remains valid without anchors. */ });
            }
            queuedPlacement = false;
          }
        }
      }
      renderer!.render(scene, viewCamera);
    });
    window.addEventListener('resize', resize);
  } catch (error) {
    say(`水門を表示できませんでした。${error instanceof Error ? error.message : 'ページを再読み込みしてください。'}`);
    dispose();
  }
}
