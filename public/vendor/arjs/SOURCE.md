# AR.js (vendored)

- Version: 3.4.7
- Files:
  - aframe-ar-3.4.7.js — from https://raw.githack.com/AR-js-org/AR.js/3.4.7/aframe/build/aframe-ar.js
  - ar-threex-location-only-3.4.7.js — from https://raw.githack.com/AR-js-org/AR.js/3.4.7/three.js/build/ar-threex-location-only.js
- License: MIT (see ./LICENSE, from https://github.com/AR-js-org/AR.js/blob/3.4.7/LICENSE)
- Why vendored instead of npm: `@ar-js-org/ar.js@3.4.7` depends on `three: ^0.164.0` and
  `aframe: ^1.6.0`, which conflicts with this project's own `three@^0.175.0` the same way
  as A-Frame itself (see ../aframe/SOURCE.md). The prebuilt UMD files have no such conflict.
- Used only under /lab/ (lab-only comparison pages; excluded from production builds).
