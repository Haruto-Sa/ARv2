# ARv2 作業状況・追加調査レポート

作成日: 2026-09-14  
対象: `main` (`922300c`) およびローカル作業ツリー

## 1. 現在地

ARv2 は、Astro の紹介ページから3種類の位置情報ARを起動し、同じ地点設定と3Dモデルを使って比較できる段階まで進んでいる。

| 項目 | 状況 | 根拠 |
| --- | --- | --- |
| Astroへの統合 | 完了 | `/`、`/ar/locar`、`/ar/arjs`、`/ar/deviceorientation`、`/lab/compare` の5ページを静的生成できる |
| 3方式の独立実装 | 完了 | `src/ar-engines/{locar,arjs,deviceorientation}` に分離され、各ARページから個別に起動する |
| 共通config | 実装済み | 3方式とも `loadLocationConfig()` を利用。`targetHeightMeters` と `scale` の検証も共通化されている |
| 紹介ページからの導線 | 実装済み | 地図、緯度経度入力、現在地取得、3方式の起動ボタンがある |
| 比較用ページ | 実装済み | `/lab/compare` から3方式へ移動できる |
| GitHub Pages / Cloudflare向けビルド | ローカル確認済み | `DEPLOY_TARGET=gh-pages` と `DEPLOY_TARGET=cloudflare` の両方でビルド成功 |
| 本番方式の決定 | 未完了 | iPhone Safariを中心とした現地比較の記録と採用判断がない |

GitHub Issue #1 のチェック欄は一部が実装状況に追いついていない。少なくとも「共通config」と「紹介ページから各AR方式への遷移」は、現在のコード上では完了している。Issue本文にある検証スクリプト名は `scripts/validate-config.mjs` だが、実ファイルは `scripts/validate-config.ts` である。

## 2. 今回の検証結果

依存関係を `npm ci` でロックファイルどおりに復元した後、次を確認した。

| 検証 | 結果 | 補足 |
| --- | --- | --- |
| `npm run test` | 成功 | 6ファイル、57テスト成功 |
| `npm run check` | 成功 | エラー0。未使用変数などのヒント3件、TypeScript 7に向けた警告1件 |
| `npm run build` | 成功 | 5ページを静的生成 |
| GitHub Pages向けビルド | 成功 | base path `/ARv2/` を使う構成 |
| Cloudflare向けビルド | 成功 | ルート `/` を使う構成 |
| location config検証 | 成功 | `heigawa-suimon.json: OK` |

`npm run validate-config` は、この管理環境では `tsx` が一時IPCソケットを作成できず `EPERM` になった。同じスクリプトを `node --import tsx scripts/validate-config.ts` で実行すると成功したため、設定内容や検証ロジックの失敗ではない。GitHub ActionsのUbuntu環境では通常の `npm run validate-config` が使える想定だが、CI実行結果で最終確認する。

## 3. 次に進められる作業

### 最優先: 実機比較と本番方式の決定

Issue #1で残っている最大の完了条件であり、PC上の自動テストでは代替できない。比較条件をそろえ、各方式について次を記録する。

- 端末・OS・Safariバージョン、天候、時刻、開始地点
- 権限許可から表示までの成功率と所要時間
- 水門に対する水平位置、高さ、縮尺、向きのずれ
- 30秒から数分静止したときのドリフト
- 歩行・端末回転後の追従と復帰
- エラー表示、再試行、再位置合わせの分かりやすさ
- Pattern A/B/Cの採用可否と、その判断理由

完了条件は、同一条件で3方式を比較した記録が残り、採用方式と不採用理由がIssueまたは別文書に明記されること。

### 優先度高: READMEを現行構成へ更新

現在のREADMEは旧Vite構成の `index.html`、`src/main.js`、`public/config/watergate-anchor.json` を中心に説明しており、実際のAstro構成、3方式、`public/config/locations/*.json` と一致していない。初参加者が誤ったファイルを探す可能性が高い。

更新対象は、起動方法、現行URL、設定ファイル、3方式の違い、デバッグ方法、ファイル構成、GitHub Pages/Cloudflareのビルド方法である。完了条件は、READMEだけでローカル起動、設定変更、比較ページへの移動、2種類のデプロイ用ビルドが再現できること。

### 優先度高: AR.jsの比較用デバッグ情報を追加

Pattern Bだけデバッグオーバーレイがなく、比較ページにも「未実装」と表示される。また、Pattern Bは `positionOffsetMeters`、`pitchDeg`、`rollDeg` を反映しない既知の制約がある。このままでは、実機でずれが出たときにセンサー、GPS、設定反映のどこが原因か切り分けにくい。

最低限、設定値、GPS取得状態・精度、モデル読込状態、算出スケール、AR.jsイベントまたはエラーを画面で確認できるようにする。未対応config項目はUIにも明記する。完了条件は、実機テスト中に開発者ツールなしで起動失敗と主要な配置条件を記録できること。

### 優先度中: CI変更を整理する

ローカル作業ツリーのCI変更は、既存の `npm run check` を、存在しない `typecheck` を許容する `npm run typecheck --if-present` と `npx astro check` に置き換えている。これでは `package.json` の `check` に含まれる明示的な `svelte-check` とCIの責務がずれ、型検査が増えたように見えて実際には一部をスキップし得る。

CIは `npm run check`、`npm run test`、`npm run validate-config`、2ターゲットのビルドを、`package.json` の明示的なスクリプト経由で実行する形にそろえるのが分かりやすい。lintを導入するなら、先にlintツールと `lint` スクリプトを追加し、`--if-present` で黙って省略しない。完了条件は、CIとローカルの検証コマンドが一致し、各チェックが実行されたことをログから判別できること。

### 優先度中: 小さな保守課題を解消する

型検査で次が検出されている。

- `deviceorientation/controller.ts` の `gpsTimeoutTimer` は代入されるが、停止・再開時に参照されない。再起動や画面遷移時のタイマー残留を防ぐなら、明示的な破棄処理に使う。
- `locar/controller.ts` の `audioEl` は再生中Audioの参照を保持するが、停止処理がない。再起動やページ内終了を設ける場合は停止・解放に使う。
- `debug/overlay.ts` はClipboard API失敗時に非推奨の `document.execCommand('copy')` を使う。対応ブラウザ範囲を確認した上でフォールバック方針を決める。
- `tsconfig.json` の `baseUrl` はTypeScript 7で廃止予定。Astro側の推奨構成を確認して移行する。

これらは現時点でビルドを止めないため、実機比較を遅らせてまで先行対応する必要はない。

### 優先度中: 外部CDN障害時の挙動を決める

紹介ページのLeaflet、Pattern BのA-Frame/AR.jsは実行時に外部CDNから取得する。通信が不安定な現地では、地図またはPattern Bだけ起動できない可能性がある。現地利用でオフライン耐性が必要なら依存物の同梱を検討し、不要なら「通信必須」とエラー表示を明確にする。

## 4. Issue #1を閉じるまでの推奨順序

1. CIの実行内容を確定し、現在のPRテンプレートとIssueテンプレートを含む未コミット変更をレビューする。
2. READMEを現行構成に更新する。
3. AR.jsに比較に必要な最小限のデバッグ情報を追加する。
4. 同じ端末・場所・時間帯で3方式の実機比較を行う。
5. 採用方式と理由を記録し、Issue #1の実装済みチェック欄とスクリプト名を更新する。
6. 採用方式の `debug` を本番設定に合わせ、GitHub PagesとCloudflareの公開URLで最終確認する。

## 5. ローカル作業ツリーについて

調査開始時点から、次の未コミット変更が存在する。今回の調査では内容を変更していない。

- `.github/workflows/ci.yml`
- `.gitignore`
- `docs/about.md`
- `.github/ISSUE_TEMPLATE/feature.yml`
- `.github/pull-request-template.md`

本レポート `docs/progress-report-2026-09-14.md` のみを今回追加した。既存変更とまとめてコミットする場合は、特にCIの検査範囲を上記の観点で再確認する。
