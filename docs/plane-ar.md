# 手のひらサイズの水門を平面に配置するAR

## 実装と選定

入口は `/ar/place`、非対応端末向けの表示は `/viewer`。実際の手を認識する方式ではなく、机・床の水平面に全幅20cmの水門を置く。

対応スマホでは最初にモデル確認画面を表示せず、カメラ利用の案内を表示する。モデルと必要なUSDZは起動前に準備し、「カメラを起動」の1タップでWebXRまたはQuick Lookへ進む。カメラ権限のダイアログはOS・ブラウザが管理し、ページから再表示を強制しない。Quick LookはOS側のAR/Object選択状態も管理するため、Webからカメラ表示の初期タブを強制しない。

スマホの判定にはタッチ対応とcoarseポインターの有無を併用し、PCおよびAR機能がないスマホは `/viewer` へ `location.replace` で遷移する。タッチ対応PCなどは判定が一致しない可能性がある。3DビューアへのリンクはAR起動画面からも利用できる。

Webの左上ホームリンクはWebXR DOM Overlayにも表示し、ARセッションを終了してからホームへ移動する。Quick Lookの標準「×」はWebのDOMではなく、置き換える公開APIは確認できない。Quick Lookを閉じると起動元のページに戻り、その左上にホームリンクがある。公開されているカスタマイズは[カスタムアクション/バナー](https://developer.apple.com/documentation/arkit/adding-an-apple-pay-button-or-a-custom-action-in-ar-quick-look)であり、今回の左上ボタンの置き換えには使わない。

| 方式 | 平面・位置の取得 | 判断 |
| --- | --- | --- |
| 既存のAR.jsマーカー | 印刷マーカーを追跡 | 平面検出ではないため今回の配置に使用しない |
| GPS・方位センサー | 地理位置と端末の向き | 机上の接地位置や端末の並進を測れないため使用しない |
| WebXR Hit Test | 端末のAR基盤が検出した面と視線の交点 | 対応端末のWeb内ARに採用。Three.jsの既存依存だけで実装 |
| AlvaAR | ブラウザ内の単眼SLAM | 実寸スケール・平面推定の検証が必要。`ar-spec.md §10.3`のGPLライセンス保留により未導入 |
| Apple Quick Look | OSによる平面検出・配置 | `rel="ar"`対応環境向け。既存GLBからUSDZをブラウザ内で生成 |
| 擬似配置 | 仮定した床とセンサーの向き | 実平面の検出と誤認されるため今回は採用しない |

WebXRはGoogleの公式資料でAndroid ChromeのARCore利用が説明されている。ブラウザ名で分岐せず `isSessionSupported('immersive-ar')` と `relList.supports('ar')` で機能を確認する。WebXRセッションには `hit-test`、`local`、操作UI用の `dom-overlay` が必要。`anchors` は任意で要求する。OS・ブラウザ・端末ごとの最終可否は実機で確認する。

## 接地・固定

- 視点基準のHit Testを毎フレーム実施し、上向き法線が水平面に近い結果のみ採用。壁や天井には配置しない。平面のポリゴン全体を構築するAPIは使わず、平面との交点を得る。
- 照準が出た状態でタップすると、交点の位置と向きを配置グループにコピーする。配置後に照準の動きでモデルを移動させない。
- Anchorが利用できれば追跡補正を反映する。Anchor未対応・作成失敗時はlocal参照空間の座標を維持する。追跡を失ったときはモデルを隠し、復帰を案内する。
- 水門の向きを適用した後のバウンディングボックスから幅を計測し、底面中央を原点にして接地。GPS用の実寸・高度・オフセットは机上配置に適用しない。
- 置き直し・終了時にAnchorを削除する。遅れて完了したAnchor作成が古い配置を復活させないよう世代番号で管理する。

## サイズ・操作

`public/config/placement.json` に全幅の既定値（0.2m）・最小（0.1m）・最大（1m）・水平面法線のしきい値を集約した。モデルの選択と向きは既存の `heigawa-suimon.json` を参照する。スライダーでサイズ・回転、ボタンで扉の動きの再生/一時停止を操作できる。3DビューアはOrbitControlsでドラッグ回転とピンチ・スクロールに対応する。

今回のユーザー指定に合わせ初期幅20cmにした。既存仕様の初期幅1m・AR内の2本指回転/ピンチ・実寸までの拡大とは異なる。水位・断面・注釈・シーク・英語UIは今回の配置実装に含めていない。

## iPhone向けのモデル

Quick Look用USDZは静止状態のメッシュとマテリアルをエクスポートする。元GLBには負のスケールがあるため、変換行列を頂点に焼き込み、反転した三角形の頂点順を直してから出力する。元の両面マテリアルはExporterで扱えないため、裏向きの三角形と法線を追加し、片面マテリアルで両面を表現する（出力の三角形数は増える）。GLBやWeb表示用ジオメトリは変更しない。生成後のリンクをユーザーがタップしてQuick Lookを開く。変換するモデルと画像は外部サービスへ送信しない。

このUSDZには扉のアニメーションは含まれない（Quick Look自体がアニメーション非対応という意味ではない）。OS側で回転・拡縮・再配置する。生成後にWeb側で変えたサイズや回転は生成済みUSDZには反映されない。高ポリゴンモデルの変換負荷、外観、Blob URLからの起動はiPhone実機で要検証。

## 検証

2026-10-11: ユーザーからスマホで検証して動作を確認できたとの報告を受領。機種・OS・ブラウザ・WebXR/Quick Look経路、配置精度の定量結果は未記録。以下は追加の実機確認項目であり、全端末確認済みを意味しない。

エンジニア向けの解説・スライドは `public/docs/ar-engineering-guide.html`（配信時 `/docs/ar-engineering-guide.html`）。オフライン表示、章切り替え、印刷/PDF、水平面法線の説明図に対応する。

自動検証: 床/壁/天井の判定、接地と20cm幅、負スケールのUSDZ用変換、設定検証。ブラウザ検証: 実際のGLB表示、アニメーション操作、非対応案内、許可拒否時の再試行、実モデルからのUSDZ生成。

実機確認: HTTPSで `/ar/place` を開き、机に配置 → 端末を左右/前後に動かす → 裏側から見る → 置き直す → 終了/再開。暗所や無地の机、追跡喪失/復帰、Anchor対応/非対応を比較する。iPhoneでは準備 → Quick Look → AR配置、20cmの初期幅、底面、表面の向き・テクスチャを確認する。自動テストは実空間の検出精度・ドリフト・Quick Look起動の実証にはならない。

## 一次資料

- [W3C WebXR Hit Test](https://www.w3.org/TR/webxr-hit-test-1/)
- [Google WebXR / ARCore](https://developers.google.com/ar/develop/webxr)
- [Three.js Hit Test example](https://github.com/mrdoob/three.js/blob/dev/examples/webxr_ar_hittest.html)
- [AlvaAR](https://github.com/alanross/AlvaAR)
- [Apple AR Quick Look](https://developer.apple.com/quick-look-gallery/)
- USDZExporterの対応範囲は同梱 `node_modules/three/examples/jsm/exporters/USDZExporter.js` を確認。
