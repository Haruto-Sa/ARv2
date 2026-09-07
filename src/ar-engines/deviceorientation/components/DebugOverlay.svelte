<script lang="ts">
  import { arState } from '../state';
  import { recordResidual, copyResults } from '../controller';

  let rowsText = $derived(
    Object.entries($arState.debugRows)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
  );
</script>

{#if $arState.debugEnabled}
  <div id="phase0-debug-overlay">
    <div class="rows">{rowsText}</div>
    <div class="flash">{$arState.debugFlash}</div>
    <div class="button-bar">
      <button type="button" onclick={recordResidual}>実物に向けて誤差記録</button>
      <button type="button" onclick={copyResults}>結果をコピー</button>
    </div>
  </div>
{/if}

<style>
  #phase0-debug-overlay {
    position: fixed;
    top: 72px;
    left: 8px;
    z-index: 15000;
    min-width: 210px;
    max-width: 280px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(5, 10, 18, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: #9fe0a8;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 11px;
    line-height: 1.55;
    pointer-events: auto;
  }
  .rows {
    white-space: pre;
  }
  .flash {
    color: #ffd76a;
    min-height: 14px;
    margin-top: 2px;
    white-space: normal;
  }
  .button-bar {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }
  .button-bar button {
    flex: 1;
    padding: 6px 4px;
    border-radius: 8px;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
  }
</style>
