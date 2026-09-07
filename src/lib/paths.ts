/**
 * GitHub Pages(サブパス配信 /ARv2/)と Cloudflare Pages(ルート配信)の両方で
 * public/ 配下のアセット・config パスが崩れないようにする base URL ヘルパー。
 * fetch/モデルロード等、public/ 配下を参照する箇所は必ずこれを経由する。
 */
export function withBase(pathname: string): string {
  const base = import.meta.env.BASE_URL;
  const trimmedBase = base.endsWith('/') ? base : `${base}/`;
  const trimmedPath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  return `${trimmedBase}${trimmedPath}`;
}
