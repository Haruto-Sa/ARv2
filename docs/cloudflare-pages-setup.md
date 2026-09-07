# Cloudflare Pages 接続手順(ダッシュボードで1回だけ行う)

GitHub Actions 側にシークレットは追加しない(Cloudflare の Git 連携を使う方針)。

1. Cloudflare ダッシュボード → Workers & Pages → Create → Pages → Connect to Git
2. リポジトリ `Haruto-Sa/ARv2` を選択、対象ブランチ `main`
3. ビルド設定:
   - Framework preset: Astro
   - Build command: `npm run build`
   - Build output directory: `dist`
   - 環境変数: `DEPLOY_TARGET` は設定しない(未設定時は `astro.config.mjs` が root base `/` を使う)
4. デプロイ後の URL(`*.pages.dev`)を確認し、GitHub Pages(`https://haruto-sa.github.io/ARv2/`)と並べて実機比較する
