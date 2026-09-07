<script lang="ts">
  import { arState } from '../state';
  import { loadInitialConfig, startExperience } from '../controller';

  loadInitialConfig();
</script>

{#if $arState.fatalError}
  <div class="fatal">設定の読み込みに失敗しました: {$arState.fatalError}</div>
{/if}

{#if !$arState.started}
  <main id="intro">
    <div class="icon">🌊</div>
    <h1>水門 AR ビューア(Pattern A)</h1>
    <p>
      指定した地点に水門の3Dモデルを実物大で重ねて表示します。
      スマートフォンを構えて見渡すと、現実の風景の中に水門が固定表示されます。
    </p>
    <ul>
      <li>📍 位置情報と方位センサーを使用します</li>
      <li>📷 開始するとカメラが起動します</li>
      <li>🧭 屋外で、空が見える場所での利用を推奨します</li>
    </ul>
    <button type="button" onclick={startExperience} disabled={!$arState.config}>ARを開始</button>
    {#if $arState.configError}
      <p class="warn">⚠ 設定の読み込みに失敗しました: {$arState.configError}</p>
    {:else if $arState.issues.length}
      <p class="warn">⚠ {$arState.issues.join(' / ')}</p>
    {/if}
    <p class="note">開始後に「カメラ」「位置情報」「モーションと画面の向き」の許可を求められたら許可してください。</p>
  </main>
{/if}

<style>
  #intro {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    padding: 28px;
    box-sizing: border-box;
    text-align: center;
    color: #eaf2ff;
    background: radial-gradient(120% 90% at 50% 0%, #12365e 0%, #06121f 60%);
  }
  .icon {
    font-size: 56px;
    line-height: 1;
  }
  h1 {
    margin: 0;
    font-size: 24px;
    letter-spacing: 0.04em;
  }
  p {
    margin: 0;
    max-width: 30em;
    font-size: 14px;
    line-height: 1.7;
    color: #b8c9e0;
  }
  ul {
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
    font-size: 13px;
    color: #93a7c4;
    line-height: 1.9;
  }
  button {
    margin-top: 8px;
    padding: 15px 40px;
    font-size: 17px;
    font-weight: 700;
    color: #06121f;
    background: linear-gradient(180deg, #6fd0ff, #3a9bff);
    border: 0;
    border-radius: 999px;
    box-shadow: 0 6px 20px rgba(58, 155, 255, 0.4);
    cursor: pointer;
  }
  button:active {
    transform: translateY(1px);
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .note {
    font-size: 12px;
    color: #6f86a6;
  }
  .warn {
    font-size: 12.5px;
    color: #ffd27a;
    max-width: 30em;
  }
  .fatal {
    position: fixed;
    inset: 0;
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: #200;
    color: #fdd;
    font: 14px/1.5 system-ui;
    text-align: center;
  }
</style>
