<script lang="ts">
  import { withBase } from '../../../lib/paths';

  // IntroPanel(z-index:50, 画面全体を覆う固定オーバーレイ)が表示されている間は
  // このパネルは自動的に隠れる(重なって見えないだけで、開始/未開始を判定する
  // 状態共有の仕組みは不要)。「ARを開始」タップ後にIntroPanelが消えて初めて見える。
</script>

<aside id="marker-panel">
  <p class="title">このマーカーにカメラを向けてください</p>
  <img src={withBase('/assets/markers/hiro.png')} alt="Hiroマーカー" />
  <a href={withBase('/ar/marker-print')} target="_blank" rel="noopener">印刷ページを開く →</a>
</aside>

<style>
  #marker-panel {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 40;
    width: min(160px, 40vw);
    padding: 10px;
    border-radius: 12px;
    background: rgba(6, 18, 31, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(6px);
    color: #eaf2ff;
    text-align: center;
  }
  .title {
    margin: 0 0 6px;
    font-size: 11px;
    line-height: 1.4;
  }
  img {
    display: block;
    width: 100%;
    border-radius: 6px;
    background: #fff;
  }
  a {
    display: block;
    margin-top: 8px;
    font-size: 11px;
    color: #9cf;
    text-decoration: none;
  }
</style>
