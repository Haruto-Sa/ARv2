// 本番ビルドから /lab/* ・検証用地点の設定ファイル・lab専用vendorライブラリを取り除く
// Astroインテグレーション(docs/ar-spec.md §3.1, §11 P0)。
//
// 「含める」を明示的なopt-inにする(既定で除外・取りこぼしたら安全側に倒れる):
// 環境変数 INCLUDE_LAB が truthy("1"/"true")のときだけ /lab/* 等を残す。
// プレビュー/開発者向けビルドでは `INCLUDE_LAB=1 npm run build` のようにして使う。
// 本番ビルド(GitHub Pages / Cloudflare 向けの既存の2ジョブ)はこの変数を渡さないため、
// 何もしなくても除外側になる。
//
// astro:build:done で dist/ から直接削除する方式を採る理由:
// Astroの静的ルーティングは `src/pages/lab/**` をファイルベースでそのままページ化するため、
// ビルド対象から動的に除外する標準機構がない。dist/ 側で後処理するのが最小の変更で済む。

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function stripLab() {
  const includeLab = /^(1|true)$/i.test(process.env.INCLUDE_LAB ?? '');

  return {
    name: 'strip-lab',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        if (includeLab) {
          logger.info('[strip-lab] INCLUDE_LAB=1 のため /lab/* 等を含めたまま出力します。');
          return;
        }

        const outDir = fileURLToPath(dir);
        const removed = [];

        const labDir = path.join(outDir, 'lab');
        if (existsSync(labDir)) {
          rmSync(labDir, { recursive: true, force: true });
          removed.push('lab/');
        }

        const vendorTargets = ['vendor/aframe', 'vendor/arjs'];
        for (const rel of vendorTargets) {
          const p = path.join(outDir, rel);
          if (existsSync(p)) {
            rmSync(p, { recursive: true, force: true });
            removed.push(rel + '/');
          }
        }
        const vendorDir = path.join(outDir, 'vendor');
        if (existsSync(vendorDir) && readdirSync(vendorDir).length === 0) {
          rmSync(vendorDir, { recursive: true, force: true });
        }

        const locationsDir = path.join(outDir, 'config', 'locations');
        if (existsSync(locationsDir)) {
          for (const f of readdirSync(locationsDir)) {
            if (f.startsWith('lab-') && f.endsWith('.json')) {
              rmSync(path.join(locationsDir, f));
              removed.push(`config/locations/${f}`);
            }
          }
        }

        if (removed.length > 0) {
          logger.info(`[strip-lab] 本番ビルドから除外しました: ${removed.join(', ')}`);
        } else {
          logger.info('[strip-lab] 除外対象は見つかりませんでした(既に無い状態でのビルド)。');
        }
      },
    },
  };
}
