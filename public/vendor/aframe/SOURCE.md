# A-Frame (vendored)

- Version: 1.6.0
- File: aframe-1.6.0.min.js
- Source: https://aframe.io/releases/1.6.0/aframe.min.js
- License: MIT (see ./LICENSE, from https://github.com/aframevr/aframe/blob/v1.6.0/LICENSE)
- Why vendored instead of npm: `aframe@1.6.0` depends on `three: npm:super-three@0.164.0`
  (its own pinned fork of three.js), which would double-load three.js alongside this
  project's own `three@^0.175.0` if installed via npm and bundled through Vite. The
  prebuilt UMD file has no such conflict since it is loaded as a plain `<script>`.
- Used only under /lab/ (lab-only comparison pages; excluded from production builds).
