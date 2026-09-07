<script lang="ts">
  import { loadInitialConfig, startExperience } from '../controller';
  import type { LocationConfig } from '../../../lib/config/locationConfig';

  type Phase = 'loading-config' | 'ready' | 'starting' | 'started' | 'error';

  let phase = $state<Phase>('loading-config');
  let config: LocationConfig | null = $state(null);
  let errorMessage = $state('');

  loadInitialConfig()
    .then((c) => {
      config = c;
      phase = 'ready';
    })
    .catch((e) => {
      errorMessage = String((e as Error)?.message || e);
      phase = 'error';
    });

  async function handleStart(): Promise<void> {
    if (!config) return;
    phase = 'starting';
    try {
      await startExperience(config);
      phase = 'started';
    } catch (e) {
      errorMessage = String((e as Error)?.message || e);
      phase = 'error';
    }
  }
</script>

{#if phase !== 'started'}
  <main id="intro">
    <div class="icon">🌊</div>
    <h1>水門 AR ビューア(Pattern B: AR.js)</h1>
    <p>
      指定した地点に水門の3Dモデルを実物大で重ねて表示します(A-Frame + AR.js の
      位置情報AR機能を使用)。スマートフォンを構えて見渡すと、現実の風景の中に
      水門が固定表示されます。
    </p>
    <ul>
      <li>📍 位置情報と方位センサーを使用します</li>
      <li>📷 開始するとカメラが起動します</li>
      <li>🧭 屋外で、空が見える場所での利用を推奨します</li>
    </ul>
    <button type="button" onclick={handleStart} disabled={phase === 'loading-config' || phase === 'starting'}>
      ARを開始
    </button>
    <p class="note">開始後に「カメラ」「位置情報」「モーションと画面の向き」の許可を求められたら許可してください。</p>
    {#if phase === 'starting'}
      <p class="starting">読み込んでいます…</p>
    {/if}
    {#if phase === 'error'}
      <p class="error">{errorMessage}</p>
    {/if}
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
  .starting {
    font-size: 13px;
    color: #9cf;
  }
  .error {
    font-size: 13px;
    color: #fbb;
  }
</style>
