# ARv2 — 水門 AR ビューア（config 駆動 / LocAR + three.js）

水門の 3D モデル（`models/suimon-kousin.glb`）を、現実の建物のように **GPS アンカーで現実空間に固定表示**するビューアです。スマホを動かしてもモデルはカメラに追従せず、位置・サイズ・高さ・向きが大きくずれないように設計しています。

土台は [LocAR](https://github.com/AR-js-org/locar)（位置ベース AR）＋ three.js。動作実績のある [suimonAR](https://github.com/Haruto-Sa/suimonAR) と同じスタックです。

## いちばん大事なこと

**位置・サイズ・高さ・向きの調整は、すべて `public/config/watergate-anchor.json` だけで行います。**

- コード内に scale / position / rotation をハードコードしていません。transform のベース値の供給元はこの 1 ファイルだけです。
- 本番では UI で値を変更しません。`debug: false` にすると、デバッグ表示も補正UIも完全に消えます。
- `debug: true` のときだけ「補正さがし用」の開発 UI が出ます。これは **値を探すための一時ツール**で、確定したらその数値を JSON に手で書き写し `debug: false` に戻す運用です（補正UIの値は localStorage に一時保存されるだけで、設定ファイルのベース値を上書きしません）。

## セットアップ / 起動

```bash
npm install
npm run dev      # HTTP の dev サーバ（http://localhost:5173）
```

dev は **HTTP のまま**でよく、証明書の準備は不要です。モバイルで必要な HTTPS は
**トンネルが終端**します（これが suimonAR が「証明書なしでどこでも動く」理由）:

```bash
# ターミナル1
npm run dev
# ターミナル2（--url は必ず http: にする）
cloudflared tunnel --url http://localhost:5173
```

表示された `https://<ランダム>.trycloudflare.com` をスマホで開く → **証明書警告なし** →
紹介ページの **「ARを開始」をタップ** → カメラ・位置情報・モーション/画面の向きを許可。

> カメラ起動はタップ後に行います（モバイルでは `getUserMedia` と方位センサー許可がユーザー操作を必要とするため）。

PC ローカルで開く場合は `http://localhost:5173`（localhost は secure context 扱い）。

## 設定ファイル `public/config/watergate-anchor.json`

| 項目 | 意味 |
| --- | --- |
| `modelPath` | 表示する glb のパス（`/models/suimon-kousin.glb`） |
| `latitude` / `longitude` | アンカーの GPS 座標。**未入力（null）だと配置できない** |
| `altitude` | 基準高度(m)。モデル全体の高さ（LocAR が世界 y に反映） |
| `yawDeg` | 水平向き（度）。**水門の向きはこれで合わせる** |
| `pitchDeg` / `rollDeg` | 傾き補正（通常 0） |
| `scale` | `targetHeightMeters` が `null` のときに使う倍率 |
| `targetHeightMeters` | 目標の実高さ(m)。`null` でなければ自動でスケール計算（後述）。初期値 `8.5`（既存 `config/locations*.yaml` の `realHeightMeters` に基づく） |
| `anchorMode` | `"gps"` |
| `originMode` | `"bottom-center"`：モデル底面中央を原点にし、底面を地面 (y=0) に接地 |
| `positionOffsetMeters.x/z` | 水平方向の微調整(m) |
| `positionOffsetMeters.y` | 高さの微調整(m) |
| `smoothing.ignoreSmallGpsMovementMeters` | この距離未満の GPS 変化を無視（LocAR の `gpsMinDistance`） |
| `smoothing.gpsMinAccuracy` | この精度(m)より悪い GPS は採用しない |
| `rendering.depthTest` / `depthWrite` | 前後関係を正しく描画する深度設定 |
| `debug` | `true` でデバッグ表示＋補正UI、`false` で両方とも完全非表示（本番） |

### `scale` と `targetHeightMeters` の優先順位

- `targetHeightMeters` が **非 null**：バウンディングボックス高さから自動計算 → `finalScale = targetHeightMeters / modelHeight`
- `targetHeightMeters` が **null**：`scale` の値をそのまま使う

距離に応じてサイズを変える処理も、UI でサイズを変える処理もありません。

### `positionOffsetMeters`

アンカー（GPS 座標）からのメートル単位の微調整。`x`/`z` で水平、`y` で高さ。モデルの基本位置は「設定ファイルのアンカー座標 ＋ オフセット」だけで決まり、カメラ位置で再配置しません。

## 現地での調整手順（この順番で）

1. **大きさ**：`targetHeightMeters`（推奨）または `scale`
2. **向き**：`yawDeg`（水平回転）
3. **水平位置**：`positionOffsetMeters.x` / `z`
4. **高さ**：`positionOffsetMeters.y`（または `altitude`）
5. ブラウザを**再読み込み**して確認
6. **UI 上で本番値を確定しない**。`debug:true` の補正UIは値さがし用。良い値が見つかったら JSON に転記し `debug:false` に戻す。

## 動作（アニメーション）と音声

- **動作**：モデル(glb)に含まれる glTF アニメーション（水門の扉など。例: `mon2Action`〜`mon5Action`）を `THREE.AnimationMixer` で再生します。`config.animation` で制御：
  - `enabled`（再生する/しない）、`loop`（ループ）、`timeScale`（速度）、`clips`（`null`=全部 / 名前の配列=指定クリップのみ）
- **音声**：glTF/GLB は音声を**埋め込めません**。音声は別ファイルにして `config.audio` で指定します：
  - 音声ファイルを `public/audio/` に置き、`audio.path` に `"/audio/ファイル名.mp3"` を設定
  - `loop` / `volume` / `autoplay`（タップ後に自動再生）
  - `audio.path` が `null` のときは音声なし（現状）。音声ファイルが用意できたらここに設定してください。
- `debug:true` のパネルに、検出したアニメーション名と音声の状態（再生中/未設定/エラー）が表示されます。

## 安定化（GPS / 方位）

`src/ar/locationScene.ts`（suimonAR の実証済み `LocationScene` を再利用）が担当：GPS の加重平滑化・デッドバンド・精度フィルタ、方位センサー＋タッチfallback、高度ノイズ抑制。**安定化はカメラ/センサー側のみで、モデルの scale や基準位置は変更しません。**

## デバッグ表示（`debug: true`）

- 読み取り専用パネル：現在の設定値 / bbox(W·H·D) / 中心 / finalScale / anchor 座標 / offset / 回転 / GPS精度・方位状態。
- シーンに XYZ 軸・地面グリッド・bbox ワイヤーを重畳。
- bbox と finalScale は**コンソール**にも出力。
- 読み込み中は画面上部に「水門モデルを読み込み中…」を表示、完了で消える（失敗時はエラー表示）。

## ファイル構成

```
index.html                              紹介ページ（タップで AR 開始）
vite.config.js                          HTTP dev + tunnel 許可（base 相対）
src/main.js                             設定読込・LocAR起動・モデル読込/正規化/配置の起点
src/ar/locationScene.ts                 LocAR+three の土台（suimonAR から再利用。カメラ/GPS/方位）
src/ar/anchorConfig.js                  設定ファイル読込・検証・既定値補完（唯一の供給元）
src/ar/normalizeModel.js                Box3 正規化（底面中央）・高さ→scale 計算
src/ar/debugHelpers.js                  軸/グリッド/bbox/情報パネル（読み取り専用）
src/ar/correctionUI.js                  debug 限定の補正UI（debug:false で非生成）
public/config/watergate-anchor.json     ★調整はこのファイルだけ
public/models/suimon-kousin.glb          モデル（フル解像度）
```

## 設計上やっていないこと

- 本番でモデルをドラッグ移動・拡大縮小・回転する UI は作っていない。
- localStorage が設定ファイルのベース値を上書きしない（補正UIの一時デルタのみ保存）。
- カメラ距離でサイズを変えない。カメラ前方に固定しない。
- 毎フレームの position/scale 書き換えをしない（設定・補正が変わった時だけ反映）。
- scale/position/rotation を複数ファイルに分散しない（供給元は `watergate-anchor.json` のみ）。

## デプロイ（任意）

GitHub Pages 等のサブパスに置く場合は、`vite.config.js` の `base` をリポジトリ名に合わせ
（例 `base: '/ARv2/'`）、設定/モデルの参照パスを相対に調整すること。トンネル運用ではこの調整は不要。
