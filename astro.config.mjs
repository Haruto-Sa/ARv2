import { defineConfig } from 'astro/config';

import svelte from '@astrojs/svelte';

// GitHub Pages はサブパス配信(/ARv2/)、Cloudflare Pages はドメインルート配信。
// 同じ static ビルドを両ターゲットへ出し分けるため、ビルド時の DEPLOY_TARGET で
// base を切り替える(GitHub Actions の GH Pages ジョブだけが gh-pages を渡す。
// Cloudflare 側は Git 連携のダッシュボードビルドなのでデフォルト値のままでよい)。
const base = process.env.DEPLOY_TARGET === 'gh-pages' ? '/ARv2/' : '/';

export default defineConfig({
  output: 'static',
  base,
  integrations: [svelte()],
});