<script lang="ts">
  import { arState } from '../state';
  import { formatInfoPanelText } from '../debugHelpers';

  let text = $derived.by(() => {
    const s = $arState;
    if (!s.config) return '';
    return formatInfoPanelText({
      config: s.config,
      bbox: s.bbox,
      finalScale: s.finalScale * (s.delta.scaleMul || 1),
      scaleMode: s.scaleMode,
      issues: s.issues,
      sensor: s.sensor,
      media: s.media,
    });
  });
</script>

{#if $arState.config?.debug}
  <pre id="debug-info-panel">{text}</pre>
{/if}

<style>
  #debug-info-panel {
    position: fixed;
    left: 8px;
    top: 8px;
    z-index: 30;
    max-width: 62vw;
    margin: 0;
    padding: 8px 10px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.62);
    color: #cfe;
    font: 11px/1.4 monospace;
    white-space: pre-wrap;
    pointer-events: auto;
    user-select: text;
  }
</style>
