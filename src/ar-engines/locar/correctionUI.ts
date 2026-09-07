// correctionUI.ts (Pattern A)
// debug 限定の「補正値さがし」開発ツール。
//  - config.debug === false のときは DOM を一切生成しない(完全非表示)。
//  - ここで触れるのは "補正デルタ" のみ。設定ファイル(locations/<id>.json)の
//    ベース値を上書きしない / localStorage がベース情報源になることはない。
//  - 確定値はユーザーが手動で JSON へ転記する運用。
//
// 補正デルタの構造:
//   { dx, dz, dy, dYawDeg, scaleMul }
//     dx/dz : 水平移動(m)(左右 / 前後)
//     dy    : 高さ移動(m)
//     dYawDeg : yaw 追加回転(度)
//     scaleMul: 最終スケールへの乗算係数(1.0 = 変更なし)

const STORAGE_KEY = 'watergate-correction-delta';

export type CorrectionDelta = {
  dx: number;
  dz: number;
  dy: number;
  dYawDeg: number;
  scaleMul: number;
};

const ZERO_DELTA: CorrectionDelta = Object.freeze({ dx: 0, dz: 0, dy: 0, dYawDeg: 0, scaleMul: 1 });

export function loadCorrectionDelta(): CorrectionDelta {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...ZERO_DELTA };
    const d = JSON.parse(raw);
    return {
      dx: Number(d.dx) || 0,
      dz: Number(d.dz) || 0,
      dy: Number(d.dy) || 0,
      dYawDeg: Number(d.dYawDeg) || 0,
      scaleMul: Number(d.scaleMul) > 0 ? Number(d.scaleMul) : 1,
    };
  } catch {
    return { ...ZERO_DELTA };
  }
}

function saveCorrectionDelta(delta: CorrectionDelta): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(delta));
  } catch {
    /* storage 無効環境では何もしない */
  }
}

export type CreateCorrectionUIOptions = {
  debug: boolean;
  onChange?: (delta: CorrectionDelta) => void;
};

export type CorrectionUIHandle = {
  panel: HTMLDivElement;
  getDelta: () => CorrectionDelta;
};

/** 補正UIを生成する。debug=false なら null を返し DOM を作らない。 */
export function createCorrectionUI({ debug, onChange }: CreateCorrectionUIOptions): CorrectionUIHandle | null {
  if (!debug) return null;

  const delta = loadCorrectionDelta();

  const panel = document.createElement('div');
  panel.id = 'correction-ui';
  panel.style.cssText = [
    'position:fixed', 'right:8px', 'bottom:8px', 'z-index:10000',
    'padding:8px', 'border-radius:8px', 'background:rgba(10,10,20,0.78)',
    'color:#eee', 'font:12px/1.4 system-ui,monospace', 'min-width:188px',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = '補正(開発用) — 確定値はJSONへ転記';
  title.style.cssText = 'font-weight:600;margin-bottom:6px;color:#9cf';
  panel.appendChild(title);

  const readout = document.createElement('pre');
  readout.style.cssText = 'margin:6px 0;white-space:pre-wrap;color:#bdf;user-select:text';

  // ステップ付きの ± ボタン行を作る。
  function row(label: string, key: keyof CorrectionDelta, step: number, isMul = false): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0';
    const name = document.createElement('span');
    name.textContent = label;
    name.style.cssText = 'flex:1';
    const minus = document.createElement('button');
    const plus = document.createElement('button');
    minus.textContent = '−';
    plus.textContent = '＋';
    for (const b of [minus, plus]) {
      b.style.cssText = 'width:30px;height:26px;font-size:15px;border:0;border-radius:5px;background:#3556a0;color:#fff';
    }
    minus.onclick = () => bump(key, -step, isMul);
    plus.onclick = () => bump(key, step, isMul);
    wrap.append(name, minus, plus);
    return wrap;
  }

  function bump(key: keyof CorrectionDelta, step: number, isMul: boolean): void {
    if (isMul) {
      delta[key] = Math.max(0.01, +(delta[key] * (1 + step)).toFixed(4));
    } else {
      delta[key] = +(delta[key] + step).toFixed(3);
    }
    apply();
  }

  function apply(): void {
    saveCorrectionDelta(delta);
    readout.textContent = JSON.stringify(delta, null, 1);
    onChange?.({ ...delta });
  }

  panel.appendChild(row('左右 dx (m)', 'dx', 0.1));
  panel.appendChild(row('前後 dz (m)', 'dz', 0.1));
  panel.appendChild(row('高さ dy (m)', 'dy', 0.1));
  panel.appendChild(row('回転 yaw (°)', 'dYawDeg', 1));
  panel.appendChild(row('scale ×', 'scaleMul', 0.05, true));

  const reset = document.createElement('button');
  reset.textContent = 'リセット';
  reset.style.cssText = 'margin-top:6px;width:100%;height:28px;border:0;border-radius:5px;background:#a04040;color:#fff';
  reset.onclick = () => {
    Object.assign(delta, ZERO_DELTA);
    apply();
  };
  panel.appendChild(reset);
  panel.appendChild(readout);

  document.body.appendChild(panel);

  // 初期適用(保存済みデルタを反映)。
  readout.textContent = JSON.stringify(delta, null, 1);
  onChange?.({ ...delta });

  return { panel, getDelta: () => ({ ...delta }) };
}
