/**
 * トップページ hero 用の、素のWebGL(ライブラリ非依存)による流水シェーダー背景。
 * fbmノイズで川の流れを表現し、ポインタ位置に波紋を出す。AR計算とは無関係の
 * 装飾効果のため src/ar-engines/ ではなくここに置く。WebGL非対応環境では
 * canvas に静的なグラデーション背景を設定してフォールバックする。
 */

const VERTEX_SRC = `
  attribute vec2 p;
  void main() {
    gl_Position = vec4(p, 0.0, 1.0);
  }
`;

// 色は BaseLayout.astro の --bg/--accent-soft/--water/--accent2 トークンを
// 0-1のvec3へ変換した値(シェーダー内でCSS変数は参照できないため定数化)。
const FRAGMENT_SRC = `
  precision highp float;

  uniform vec2 uRes;
  uniform vec2 uPointer;
  uniform float uPointerOn;
  uniform float uPulse;
  uniform float uT;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 r = mat2(0.80, -0.60, 0.60, 0.80);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = r * p * 2.03 + 11.7;
      a *= 0.50;
    }
    return v;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / max(uRes.y, 1.0);

    vec2 p = uv - 0.5;
    p.x *= aspect;

    float t = uT * 0.26;

    float broad = fbm(p * 1.75 + vec2(t * 0.20, -t * 0.10));
    float detail = fbm(
      p * 4.5 +
      vec2(-t * 0.34, t * 0.22) +
      vec2(broad * 0.45, broad * 0.25)
    );

    vec2 ptr = uPointer - 0.5;
    ptr.x *= aspect;
    float d = length(p - ptr);

    float pointerRipple =
      sin(d * 45.0 - uT * 4.2) *
      exp(-d * 6.2) *
      uPointerOn * 0.045;

    float pulseRipple =
      sin(d * 58.0 - uT * 7.5) *
      exp(-d * 4.8) *
      uPulse * 0.080;

    float drift =
      sin((p.x + broad * 0.20) * 8.0 + t * 2.0) * 0.022 +
      sin((p.y - detail * 0.18) * 11.0 - t * 1.4) * 0.018;

    float distortion = broad * 0.16 + detail * 0.10 +
      pointerRipple + pulseRipple + drift;

    vec3 pale = vec3(0.933, 0.965, 0.984);
    vec3 mid = vec3(0.663, 0.847, 0.941);
    vec3 deep = vec3(0.110, 0.435, 0.659);
    vec3 green = vec3(0.247, 0.682, 0.478);

    float depth = smoothstep(0.18, 1.05, 1.0 - uv.y + distortion);
    vec3 col = mix(pale, mid, depth);
    col = mix(col, deep, smoothstep(0.62, 1.08, depth + broad * 0.22));
    col = mix(col, green, smoothstep(0.72, 1.0, detail) * 0.11);

    float ridge1 = abs(sin((p.x * 8.0 + p.y * 5.0) + detail * 5.2 + t * 2.2));
    float ridge2 = abs(sin((p.x * -5.0 + p.y * 9.0) + broad * 4.0 - t * 1.7));
    float caustic = pow(1.0 - min(ridge1, ridge2), 5.5);
    caustic *= 0.08 + 0.16 * smoothstep(0.15, 0.85, depth);

    vec2 readP = vec2(p.x / max(aspect, 1.0), p.y + 0.02);
    float readMask = 1.0 - smoothstep(0.05, 0.56, length(readP * vec2(1.05, 1.25)));
    col = mix(col, vec3(1.0, 1.0, 1.0), readMask * 0.34);

    col += caustic;
    col += (pointerRipple + pulseRipple) * vec3(0.55, 0.85, 1.0);

    float vignette = smoothstep(0.95, 0.25, length(p * vec2(0.72, 0.90)));
    col *= 0.94 + vignette * 0.06;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const FALLBACK_BACKGROUND = 'radial-gradient(circle at 50% 40%, #f4fafd 0%, #cfe6f5 45%, #6fabd6 100%)';

export type WaterCanvasHandle = { teardown: () => void };

/** hero canvas に流水シェーダーを描画する。呼び出し側は unmount 時に teardown() を呼ぶこと。 */
export function initWaterCanvas(canvas: HTMLCanvasElement): WaterCanvasHandle {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) {
    canvas.style.background = FALLBACK_BACKGROUND;
    return { teardown: () => {} };
  }

  const compile = (type: number, src: string): WebGLShader => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[water shader]', gl.getShaderInfoLog(s));
    }
    return s;
  };

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX_SRC));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAGMENT_SRC));
  gl.linkProgram(prog);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[water shader link]', gl.getProgramInfoLog(prog));
    canvas.style.background = FALLBACK_BACKGROUND;
    return { teardown: () => {} };
  }

  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uT = gl.getUniformLocation(prog, 'uT');
  const uPointer = gl.getUniformLocation(prog, 'uPointer');
  const uPointerOn = gl.getUniformLocation(prog, 'uPointerOn');
  const uPulse = gl.getUniformLocation(prog, 'uPulse');

  const pointer = { x: 0.5, y: 0.52, tx: 0.5, ty: 0.52, active: 0, targetActive: 0, pulse: 0 };

  const setPointer = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    pointer.tx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    pointer.ty = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  };
  const onMove = (e: PointerEvent) => setPointer(e);
  const onEnter = (e: PointerEvent) => {
    setPointer(e);
    pointer.targetActive = 1;
  };
  const onLeave = () => {
    pointer.targetActive = 0;
  };
  const onDown = (e: PointerEvent) => {
    setPointer(e);
    pointer.pulse = 1;
  };

  canvas.addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerenter', onEnter, { passive: true });
  canvas.addEventListener('pointerleave', onLeave, { passive: true });
  canvas.addEventListener('pointerdown', onDown, { passive: true });

  const resize = () => {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.uniform2f(uRes, canvas.width, canvas.height);
  };
  resize();

  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);

  let visible = true;
  const io = window.IntersectionObserver
    ? new IntersectionObserver(
        (entries) => {
          visible = entries[0] ? entries[0].isIntersecting : true;
        },
        { rootMargin: '120px 0px' }
      )
    : null;
  io?.observe(canvas);

  let t = 0;
  let last = performance.now();
  let raf = 0;

  const frame = (now: number) => {
    const dt = Math.min(0.08, (now - last) / 1000);
    last = now;

    if (!reducedMotion) t += dt * 1.5;

    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 7.5);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 7.5);
    pointer.active += (pointer.targetActive - pointer.active) * Math.min(1, dt * 5.5);
    pointer.pulse *= Math.exp(-dt * 2.2);

    if (visible) {
      resize();
      gl.uniform1f(uT, t);
      gl.uniform2f(uPointer, pointer.x, pointer.y);
      gl.uniform1f(uPointerOn, reducedMotion ? 0 : pointer.active);
      gl.uniform1f(uPulse, reducedMotion ? 0 : pointer.pulse);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    teardown: () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerenter', onEnter);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
    },
  };
}
