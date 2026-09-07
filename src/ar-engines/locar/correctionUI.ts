// correctionUI.ts (Pattern A)
// debug 限定の「補正値さがし」用の純粋なストレージ操作のみ。DOM生成は
// CorrectionControls.svelte の責務。
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

export const ZERO_DELTA: CorrectionDelta = Object.freeze({ dx: 0, dz: 0, dy: 0, dYawDeg: 0, scaleMul: 1 });

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

export function saveCorrectionDelta(delta: CorrectionDelta): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(delta));
  } catch {
    /* storage 無効環境では何もしない */
  }
}
