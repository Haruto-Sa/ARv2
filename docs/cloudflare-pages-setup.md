# Cloudflare へのデプロイ(ダッシュボードで1回だけ行う)

GitHub Actions 側にシークレットは追加しない(Cloudflare の Git 連携を使う方針)。

1. Cloudflare ダッシュボード → Workers & Pages → Import a repository
2. リポジトリ `Haruto-Sa/ARv2` を選択、対象ブランチ `main`
3. ビルド設定:
   - Framework preset: Astro
   - Build command: `npm run build`
   - Deploy command: `npx wrangler versions upload`(ダッシュボードの既定のまま)
   - 環境変数: `DEPLOY_TARGET` は設定しない(未設定時は `astro.config.mjs` が root base `/` を使う)
4. デプロイ後の URL(`*.workers.dev`)を確認し、GitHub Pages(`https://haruto-sa.github.io/ARv2/`)と並べて実機比較する

## 補足: なぜ `wrangler.jsonc` が要るか

Cloudflare の現行の「Workers & Pages」統合フローで Git リポジトリをインポートすると、
デプロイコマンドが `npx wrangler versions upload` になる(旧来の Pages 専用フローとは異なる)。
このコマンドは静的アセットの出力先をリポジトリ直下の `wrangler.jsonc` から読むため、
`assets.directory: "./dist"` を明示していないと `Missing entry-point to Worker script or to
assets directory` で失敗する。`name` フィールドは Cloudflare 側のプロジェクト名(workers.dev
サブドメインの一部、例: `arv2`)と一致させること — 一致しないと別Workerとして扱われる。
