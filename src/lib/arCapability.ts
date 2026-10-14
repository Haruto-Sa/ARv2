/**
 * 端末が平面AR(/ar/place)を使えるかどうかの判定。
 * src/ar-engines/place/experience.ts の起動時リダイレクト判定と同じ基準を共有する
 * (カメラ権限は要求しない、WebXR immersive-ar または Quick Look のどちらかに対応していればAR対応とみなす)。
 */
export async function supportsPlaneAR(): Promise<boolean> {
  if (!window.isSecureContext) return false;
  const mobile = navigator.maxTouchPoints > 0 && window.matchMedia('(any-pointer: coarse)').matches;
  if (!mobile) return false;
  const supportsXR =
    !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar').catch(() => false));
  const supportsQuicklook = document.createElement('a').relList.supports('ar');
  return supportsXR || supportsQuicklook;
}
