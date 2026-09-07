<script lang="ts">
  import { arState } from '../state';

  // カメラ/GPS/モデルの状態を1つのオーバーレイにまとめて表示。全部OKなら消す。
  let text = $derived.by(() => {
    const st = $arState.stage;
    if (st.camera === 'error') {
      return (
        'カメラを起動できませんでした(' + st.camError + ')。\n' +
        'https(トンネル) か localhost で開き、カメラを許可してください。'
      );
    }
    if (st.model === 'error') {
      return 'モデルの読み込みに失敗しました: ' + ($arState.config?.modelPath ?? '');
    }
    const parts: string[] = [];
    if (st.camera !== 'ok') parts.push('カメラ起動中…');
    if (st.model !== 'loaded') parts.push('モデル読み込み中…');
    if (st.gps !== 'ready') parts.push('GPS取得中…(屋外で空が見える場所が有利)');
    return parts.length ? parts.join('\n') : null;
  });

  let isError = $derived($arState.stage.camera === 'error' || $arState.stage.model === 'error');
</script>

{#if $arState.started && text}
  <div id="model-status" class:error={isError}>{text}</div>
{/if}

<style>
  #model-status {
    position: fixed;
    left: 50%;
    top: 14px;
    transform: translateX(-50%);
    z-index: 40;
    padding: 8px 14px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.6);
    color: #dff;
    font: 13px/1.4 system-ui;
    pointer-events: none;
    white-space: pre-line;
    text-align: center;
  }
  #model-status.error {
    color: #fbb;
  }
</style>
