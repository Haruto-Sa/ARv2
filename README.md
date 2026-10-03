# ARv2 — 閉伊川水門 AR / 3D 体験プロジェクト

岩手県宮古市・閉伊川水門を題材に、位置情報AR・3Dビューアで体験できるプロジェクトです。ビルド後は静的ファイルのみで動作します（サーバーサイドの実行環境は持ちません）。

## 体験できるもの

- **ロケーションAR**（3方式を比較できる構成）
  - 水門の3Dモデルを、GPSアンカーで現実空間に実物大で重ねて表示します。
  - スマホを動かしてもモデルはカメラに追従せず、位置・サイズ・高さ・向きが大きくずれないように設計しています。
  - 3方式とも同じ設定ファイルの地点情報を使い、同じ場所での実機比較ができます。
- **閉伊川3D世界**：Unity製WebGLビルドによる3D空間体験。
- **開発者向け比較ランチャー**：3方式のARページを素早く切り替えて確認するための内部ページ。

## いちばん大事なこと

**位置・サイズ・高さ・向きの調整は、すべて `public/config/locations/<id>.json` だけで行います。**

- コード内に scale / position / rotation をハードコードしていません。transform のベース値の供給元はこのファイルだけです。
- 本番では UI で値を変更しません。`debug: false` にすると、デバッグ表示も補正UIも完全に消えます。
- `debug: true` のときだけ「補正さがし用」の開発 UI が出ます。これは**値を探すための一時ツール**で、確定したらその数値を JSON に手で書き写し `debug: false` に戻す運用です（補正UIの値は localStorage に一時保存されるだけで、設定ファイルのベース値を上書きしません）。

## 技術構成（概要）

リポジトリの詳細な依存ライブラリ・バージョンは `package.json` を参照してください。ここでは概要のみ記載します。

- 静的サイトジェネレータ上に構築し、ビルド成果物は純粋な静的ファイル（HTML/CSS/JS）のみです。
- UIの一部はコンポーネント指向のフロントエンドライブラリで構築しています。
- 3D描画・位置情報ARはWebGL系のオープンソースライブラリを使用しています。
- バックエンドAPIやデータベースは持ちません。外部通信は地図タイル表示・Webフォント読み込みなど、公開APIへの読み取りアクセスのみです。
- デプロイに使う認証情報・シークレットはリポジトリに含まれません（GitHub Pagesは標準のCI権限、Cloudflare側はダッシュボードのGit連携を利用）。

## セットアップ / 開発

```bash
npm install
npm run dev
```

ターミナルに表示される URL（既定では `http://localhost:4321` 付近。ポートが使用中の場合は自動で変わります）を開いてください。

モバイル実機で確認する場合、HTTPS 終端にトンネルを使う運用です（dev サーバ自体は HTTP のままで証明書準備は不要）:

```bash
# ターミナル1
npm run dev
# ターミナル2（--url は npm run dev が表示したポートに合わせる）
cloudflared tunnel --url http://localhost:<port>
```

表示された `https://<ランダム>.trycloudflare.com` をスマホで開く → 証明書警告なし → 体験メニューから方式を選択 → カメラ・位置情報・モーション/画面の向きを許可。

> カメラ起動はタップ後に行われます（モバイルでは `getUserMedia` と方位センサー許可がユーザー操作を必要とするため）。

### 主な npm スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバ起動 |
| `npm run build` | 本番ビルド（`dist/` に出力） |
| `npm run preview` | ビルド成果物をローカルで確認 |
| `npm run check` | 型チェック |
| `npm run test` | ユニットテスト |
| `npm run validate-config` | `public/config/locations/*.json` の整合性検証 |

## 設定ファイル `public/config/locations/`

- `index.json`：体験できる地点の一覧（地図ピン表示などに使用）。
- `<id>.json`：地点ごとの詳細設定。

| 項目 | 意味 |
| --- | --- |
| `modelPath` | 表示する glb のパス |
| `latitude` / `longitude` | アンカーの GPS 座標。未入力（null）だと配置できない |
| `altitude` | 基準高度(m)。モデル全体の高さに反映 |
| `yawDeg` | 水平向き（度）。水門の向きはこれで合わせる |
| `pitchDeg` / `rollDeg` | 傾き補正（通常 0） |
| `scale` | `targetHeightMeters` が `null` のときに使う倍率 |
| `targetHeightMeters` | 目標の実高さ(m)。`null` でなければバウンディングボックス高さから自動でスケール計算 |
| `anchorMode` | `"gps"` |
| `originMode` | `"bottom-center"`：モデル底面中央を原点にし、底面を地面 (y=0) に接地 |
| `positionOffsetMeters.x/z` | 水平方向の微調整(m) |
| `positionOffsetMeters.y` | 高さの微調整(m) |
| `smoothing.ignoreSmallGpsMovementMeters` | この距離未満の GPS 変化を無視 |
| `smoothing.gpsMinAccuracy` | この精度(m)より悪い GPS は採用しない |
| `animation` | glTFアニメーションの再生制御（`enabled` / `loop` / `timeScale` / `clips`） |
| `audio` | 別ファイル音声の再生設定（glTF自体は音声を埋め込めないため） |
| `rendering.depthTest` / `depthWrite` | 前後関係を正しく描画する深度設定 |
| `debug` | `true` でデバッグ表示＋補正UI、`false` で両方とも完全非表示（本番） |

### `scale` と `targetHeightMeters` の優先順位

- `targetHeightMeters` が非 null：`finalScale = targetHeightMeters / modelHeight` を自動計算。
- `targetHeightMeters` が null：`scale` の値をそのまま使う。

距離に応じてサイズを変える処理も、UI でサイズを変える処理もありません。

## 現地での調整手順（この順番で）

1. **大きさ**：`targetHeightMeters`（推奨）または `scale`
2. **向き**：`yawDeg`（水平回転）
3. **水平位置**：`positionOffsetMeters.x` / `z`
4. **高さ**：`positionOffsetMeters.y`（または `altitude`）
5. ブラウザを**再読み込み**して確認
6. **UI 上で本番値を確定しない**。`debug:true` の補正UIは値さがし用。良い値が見つかったら JSON に転記し `debug:false` に戻す。

## プロジェクト構成（概要）

```
src/pages/           ルーティング（トップページ・AR各方式・開発者用比較ページ）
src/ar-engines/       AR方式ごとの実装（方式間でimportし合わない独立構成）
src/lib/              共有ユーティリティ（座標計算・モデル正規化・設定読込・デバッグ表示 等）
public/config/locations/  地点ごとの設定ファイル（調整はここだけ）
public/models/         3Dモデル
public/unity/           Unity製WebGLビルドの静的ファイル
legacy/                 以前の実装の参照用アーカイブ（現行ビルドには含まれない）
```

## 設計上やっていないこと

- 本番でモデルをドラッグ移動・拡大縮小・回転する UI は作っていない。
- localStorage が設定ファイルのベース値を上書きしない（補正UIの一時デルタのみ保存）。
- カメラ距離でサイズを変えない。カメラ前方に固定しない。
- 毎フレームの position/scale 書き換えをしない（設定・補正が変わった時だけ反映）。
- scale/position/rotation を複数ファイルに分散しない（供給元は地点ごとの設定ファイルのみ）。

## デプロイ

GitHub Pages と Cloudflare の両方に、同じビルドをパス構成だけ切り替えて配信しています（ビルド時の環境変数でベースパスを切替）。具体的な手順は `docs/` 配下を参照してください。
