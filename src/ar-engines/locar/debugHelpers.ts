// debugHelpers.ts (Pattern A)
// three.js シーンへのデバッグ可視化(軸・bbox・グリッド)と、デバッグパネル用の
// テキスト整形のみを扱う。DOM生成は行わない(DebugPanel.svelteの責務)。
// config.debug === true のときだけ呼ばれる想定。

import * as THREE from 'three';
import type { BoundingBox } from '../../lib/model/normalizeModel';
import type { LocationConfig } from '../../lib/config/locationConfig';

/** 正規化後の wrapper(Object3D) に XYZ 軸・bbox ワイヤーを追加する。 */
export function addModelDebugVisuals(wrapper: THREE.Object3D, bbox: BoundingBox): void {
  const axisLen = Math.max(1, bbox.height || 1);
  wrapper.add(new THREE.AxesHelper(axisLen));

  // bbox ワイヤー(補正後ローカル: 底面 y=0, 中心 x=z=0 を想定)
  const geom = new THREE.BoxGeometry(bbox.width, bbox.height, bbox.depth);
  const line = new THREE.LineSegments(
    new THREE.EdgesGeometry(geom),
    new THREE.LineBasicMaterial({ color: 0x00ff88 })
  );
  line.position.set(0, bbox.height / 2, 0);
  wrapper.add(line);
}

/** シーンに地面グリッドを追加。 */
export function addGroundGrid(scene: THREE.Scene, size = 40, divisions = 40): void {
  const grid = new THREE.GridHelper(size, divisions, 0x4488ff, 0x224466);
  scene.add(grid);
}

export type SensorStatus = {
  originReady: boolean;
  gpsAccuracy: number | null;
  orientation: string;
};

export type MediaStatus = {
  animations: string[];
  audio: string;
};

export type InfoPanelData = {
  config: LocationConfig;
  bbox: BoundingBox | null;
  finalScale: number;
  scaleMode: 'targetHeight' | 'scale';
  issues: string[];
  sensor: SensorStatus;
  media: MediaStatus;
};

/** 現在の設定・bbox・scale 等を、読み取り専用パネル向けのテキストに整形する。 */
export function formatInfoPanelText(data: InfoPanelData): string {
  const { config, bbox, finalScale, scaleMode, issues, sensor, media } = data;
  const fmt = (n: number | null | undefined, d = 2) => (n == null ? 'null' : Number(n).toFixed(d));
  const lines: string[] = [];
  lines.push('=== location config (read-only) ===');
  if (issues && issues.length) {
    lines.push('⚠ ' + issues.join('\n⚠ '));
    lines.push('');
  }
  lines.push(`model      : ${config.modelPath}`);
  lines.push(`anchor     : lat=${config.latitude}  lon=${config.longitude}  alt=${fmt(config.altitude)}`);
  lines.push(
    `offset(m)  : x=${fmt(config.positionOffsetMeters.x)} y=${fmt(config.positionOffsetMeters.y)} z=${fmt(config.positionOffsetMeters.z)}`
  );
  lines.push(`rotation   : yaw=${fmt(config.yawDeg)} pitch=${fmt(config.pitchDeg)} roll=${fmt(config.rollDeg)}`);
  if (bbox) {
    lines.push(`bbox(m)    : W=${fmt(bbox.width)} H=${fmt(bbox.height)} D=${fmt(bbox.depth)}`);
    lines.push(`bboxCenter : x=${fmt(bbox.center.x)} y=${fmt(bbox.center.y)} z=${fmt(bbox.center.z)}`);
  }
  lines.push(
    `finalScale : ${fmt(finalScale, 4)}  (${
      scaleMode === 'targetHeight' ? `targetHeight=${fmt(config.targetHeightMeters)}m` : `scale=${fmt(config.scale)}`
    })`
  );
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
  return lines.join('\n');
}

export function logConfigSnapshot(config: LocationConfig): void {
  console.info('[location-config] 現在の設定値:', JSON.parse(JSON.stringify(config)));
}
