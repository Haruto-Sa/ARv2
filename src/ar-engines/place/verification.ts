import { withBase } from '../../lib/paths';

/** Explicit, local-only verification tools. No telemetry or automatic camera capture. */
export function mountPlacementVerification(root: HTMLElement, snapshot: () => Record<string, unknown>, signal?: AbortSignal) {
  if (new URLSearchParams(location.search).get('verify') !== '1') return;
  const listen = (target: Element, type: string, callback: EventListener) => target.addEventListener(type, callback, { signal });
  const button = root.querySelector<HTMLButtonElement>('#verification-open')!;
  const dialog = root.querySelector<HTMLDialogElement>('#verification-dialog')!;
  const report = root.querySelector<HTMLTextAreaElement>('#verification-report')!;
  const feedback = root.querySelector<HTMLElement>('#verification-feedback')!;
  const summary = root.querySelector<HTMLElement>('#verification-summary')!;
  let build: unknown = { available: false, reason: '開発サーバー、またはビルド情報のない配信' };
  let opener: HTMLElement | null = null;
  const render = () => {
    const state = snapshot();
    const size = state.modelReferenceDimensionsMeters as { width: number } | null;
    const width = size ? `基準全幅 ${Math.round(size.width * 100)}cm` : 'モデルを読み込み中';
    const tracking = state.tracking === 'lost' ? '追跡を見失っています' : state.tracking === 'tracking' ? '追跡中' : 'カメラ未開始';
    const mode = state.route === 'quick-look' ? 'iPhoneのOS内の配置・追跡は観測できません'
      : state.route === 'viewer' ? '3Dビューア（実空間への配置なし）'
      : `${state.placed ? '配置済み' : '未配置'} · ${tracking}`;
    summary.textContent = `${width} ／ ${mode}`;
    report.value = JSON.stringify({
      recordedAt: new Date().toISOString(), page: location.href,
      userAgent: navigator.userAgent, secureContext: isSecureContext,
      build, ...state,
      note: 'サイズと座標はアプリ内の値です。実空間の接地・精度・ドリフトは実機で別途計測してください。Quick Look内の配置・追跡はWebから取得できません。',
    }, null, 2);
  };
  button.hidden = false;
  listen(button, 'click', () => { opener = document.activeElement as HTMLElement; render(); dialog.showModal(); });
  listen(dialog, 'close', () => opener?.focus());
  listen(root.querySelector('#verification-close')!, 'click', () => dialog.close());
  listen(root.querySelector('#verification-refresh')!, 'click', render);
  listen(root.querySelector('#verification-download')!, 'click', () => {
    render();
    const url = URL.createObjectURL(new Blob([report.value], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `placement-check-${Date.now()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  listen(root.querySelector('#verification-copy')!, 'click', async () => {
    render();
    try { await navigator.clipboard.writeText(report.value); feedback.textContent = 'コピーしました。'; }
    catch {
      root.querySelector<HTMLDetailsElement>('#verification-data')!.open = true;
      report.focus(); report.select(); feedback.textContent = 'コピーできませんでした。選択した内容を手動でコピーするか、JSONを保存してください。';
    }
  });
  void fetch(withBase('/build-info.json'), { cache: 'no-store', signal }).then(async response => {
    if (response.ok) build = await response.json();
  }).catch(() => {}).finally(() => { if (!signal?.aborted && dialog.open) render(); });
}
