// debugHelpers.js
// 読み取り専用のデバッグ表示（three.js 版）。値を変更する UI は含まない。
// config.debug === true のときだけ呼ばれる想定。

import * as THREE from 'three';

// 正規化後の wrapper(Object3D) に XYZ 軸・bbox ワイヤーを追加する。
export function addModelDebugVisuals(wrapper, bbox) {
  const axisLen = Math.max(1, bbox.height || 1);
  wrapper.add(new THREE.AxesHelper(axisLen));

  // bbox ワイヤー（補正後ローカル: 底面 y=0, 中心 x=z=0 を想定）
  const geom = new THREE.BoxGeometry(bbox.width, bbox.height, bbox.depth);
  const line = new THREE.LineSegments(
    new THREE.EdgesGeometry(geom),
    new THREE.LineBasicMaterial({ color: 0x00ff88 }),
  );
  line.position.set(0, bbox.height / 2, 0);
  wrapper.add(line);
}

// シーンに地面グリッドを追加。
export function addGroundGrid(scene, size = 40, divisions = 40) {
  const grid = new THREE.GridHelper(size, divisions, 0x4488ff, 0x224466);
  scene.add(grid);
}

// 画面上の読み取り専用情報パネル。値の編集はできない。
export function createInfoPanel() {
  const el = document.createElement('div');
  el.id = 'debug-info-panel';
  el.style.cssText = [
    'position:fixed', 'left:8px', 'top:8px', 'z-index:30',
    'max-width:62vw', 'padding:8px 10px', 'border-radius:6px',
    'background:rgba(0,0,0,0.62)', 'color:#cfe', 'font:11px/1.4 monospace',
    'white-space:pre-wrap', 'pointer-events:auto', 'user-select:text',
  ].join(';');
  document.body.appendChild(el);
  return el;
}

// 現在の設定・bbox・scale 等をパネルへ描画する（表示のみ）。
export function renderInfoPanel(panel, { config, bbox, finalScale, scaleMode, issues, sensor, media }) {
  if (!panel) return;
  const fmt = (n, d = 2) => (n == null ? 'null' : Number(n).toFixed(d));
  const lines = [];
  lines.push('=== watergate-anchor (read-only) ===');
  if (issues && issues.length) {
    lines.push('⚠ ' + issues.join('\n⚠ '));
    lines.push('');
  }
  lines.push(`model      : ${config.modelPath}`);
  lines.push(`anchor     : lat=${config.latitude}  lon=${config.longitude}  alt=${fmt(config.altitude)}`);
  lines.push(`offset(m)  : x=${fmt(config.positionOffsetMeters.x)} y=${fmt(config.positionOffsetMeters.y)} z=${fmt(config.positionOffsetMeters.z)}`);
  lines.push(`rotation   : yaw=${fmt(config.yawDeg)} pitch=${fmt(config.pitchDeg)} roll=${fmt(config.rollDeg)}`);
  if (bbox) {
    lines.push(`bbox(m)    : W=${fmt(bbox.width)} H=${fmt(bbox.height)} D=${fmt(bbox.depth)}`);
    lines.push(`bboxCenter : x=${fmt(bbox.center.x)} y=${fmt(bbox.center.y)} z=${fmt(bbox.center.z)}`);
  }
  lines.push(`finalScale : ${fmt(finalScale, 4)}  (${scaleMode === 'targetHeight' ? `targetHeight=${fmt(config.targetHeightMeters)}m` : `scale=${fmt(config.scale)}`})`);
  if (media) {
    lines.push('');
    lines.push(`animations : ${media.animations && media.animations.length ? media.animations.join(', ') : 'none'}`);
    lines.push(`audio      : ${media.audio || 'none'}`);
  }
  if (sensor) {
    lines.push('');
    lines.push(`gps.origin : ${sensor.originReady ? 'ready' : 'waiting…'}`);
    lines.push(`gps.acc(m) : ${sensor.gpsAccuracy == null ? 'n/a' : fmt(sensor.gpsAccuracy, 1)}`);
    lines.push(`orientation: ${sensor.orientation || 'pending'}`);
  }
  panel.textContent = lines.join('\n');
}

export function logConfigSnapshot(config) {
  // eslint-disable-next-line no-console
  console.info('[watergate-anchor] 現在の設定値:', JSON.parse(JSON.stringify(config)));
}
