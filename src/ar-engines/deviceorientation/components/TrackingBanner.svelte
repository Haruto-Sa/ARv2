<script lang="ts">
  import { arState } from '../state';
</script>

{#if $arState.trackingBannerVisible}
  <div id="tracking-banner">{$arState.trackingBannerText}</div>
{/if}

<style>
  #tracking-banner {
    position: fixed;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 11000;
    padding: 8px 16px;
    border-radius: 999px;
    background: rgba(255, 178, 64, 0.92);
    color: #1d1303;
    font-size: 13px;
    font-weight: 700;
  }
</style>
