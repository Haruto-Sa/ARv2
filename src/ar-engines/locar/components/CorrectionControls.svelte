<script lang="ts">
  import { arState } from '../state';
  import { bumpCorrectionDelta, resetCorrectionDelta } from '../controller';
  import type { CorrectionDelta } from '../correctionUI';

  const rows: Array<{ label: string; key: keyof CorrectionDelta; step: number; isMul?: boolean }> = [
    { label: '左右 dx (m)', key: 'dx', step: 0.1 },
    { label: '前後 dz (m)', key: 'dz', step: 0.1 },
    { label: '高さ dy (m)', key: 'dy', step: 0.1 },
    { label: '回転 yaw (°)', key: 'dYawDeg', step: 1 },
    { label: 'scale ×', key: 'scaleMul', step: 0.05, isMul: true },
  ];
</script>

{#if $arState.config?.debug}
  <div id="correction-ui">
    <div class="title">補正(開発用) — 確定値はJSONへ転記</div>
    {#each rows as row (row.key)}
      <div class="row">
        <span class="label">{row.label}</span>
        <button type="button" onclick={() => bumpCorrectionDelta(row.key, -row.step, !!row.isMul)}>−</button>
        <button type="button" onclick={() => bumpCorrectionDelta(row.key, row.step, !!row.isMul)}>＋</button>
      </div>
    {/each}
    <button type="button" class="reset" onclick={resetCorrectionDelta}>リセット</button>
    <pre class="readout">{JSON.stringify($arState.delta, null, 1)}</pre>
  </div>
{/if}

<style>
  #correction-ui {
    position: fixed;
    right: 8px;
    bottom: 8px;
    z-index: 10000;
    padding: 8px;
    border-radius: 8px;
    background: rgba(10, 10, 20, 0.78);
    color: #eee;
    font: 12px/1.4 system-ui, monospace;
    min-width: 188px;
  }
  .title {
    font-weight: 600;
    margin-bottom: 6px;
    color: #9cf;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 3px 0;
  }
  .label {
    flex: 1;
  }
  .row button {
    width: 30px;
    height: 26px;
    font-size: 15px;
    border: 0;
    border-radius: 5px;
    background: #3556a0;
    color: #fff;
    cursor: pointer;
  }
  .reset {
    margin-top: 6px;
    width: 100%;
    height: 28px;
    border: 0;
    border-radius: 5px;
    background: #a04040;
    color: #fff;
    cursor: pointer;
  }
  .readout {
    margin: 6px 0 0;
    white-space: pre-wrap;
    color: #bdf;
    user-select: text;
  }
</style>
