import { describe, it, expect } from 'vitest';
import { normalizeConfig, validateConfig, applyLatLonOverride } from './locationConfig';

describe('normalizeConfig', () => {
  it('欠損キーを既定値で補完する', () => {
    const config = normalizeConfig({ id: 'heigawa-suimon', name: '閉伊川水門', modelPath: '/models/suimon-kousin.glb' });
    expect(config.scale).toBe(1.0);
    expect(config.targetHeightMeters).toBeNull();
    expect(config.originMode).toBe('bottom-center');
    expect(config.anchorMode).toBe('gps');
    expect(config.positionOffsetMeters).toEqual({ x: 0, y: 0, z: 0 });
    expect(config.smoothing.gpsMinAccuracy).toBe(60);
  });

  it('未知の originMode / anchorMode は既定値にフォールバックする', () => {
    const config = normalizeConfig({ originMode: 'nonsense', anchorMode: 'nonsense' });
    expect(config.originMode).toBe('bottom-center');
    expect(config.anchorMode).toBe('gps');
  });

  it('latitude/longitude が数値でなければ null になる', () => {
    const config = normalizeConfig({ latitude: 'abc', longitude: NaN });
    expect(config.latitude).toBeNull();
    expect(config.longitude).toBeNull();
  });
});

describe('validateConfig', () => {
  const base = normalizeConfig({
    id: 'heigawa-suimon',
    name: '閉伊川水門',
    modelPath: '/models/suimon-kousin.glb',
    latitude: 39.6395435045501,
    longitude: 141.96414846972124,
    targetHeightMeters: 8.5,
  });

  it('必須項目が揃っていれば issue なし', () => {
    expect(validateConfig(base)).toEqual([]);
  });

  it('latitude/longitude 欠損を検出する', () => {
    const config = { ...base, latitude: null };
    expect(validateConfig(config).some((i) => i.includes('latitude'))).toBe(true);
  });

  it('targetHeightMeters と scale の併用意図を検出する(旧 defaultSize バグの再発防止)', () => {
    const config = { ...base, targetHeightMeters: 8.5, scale: 2.0 };
    expect(validateConfig(config).some((i) => i.includes('併用'))).toBe(true);
  });

  it('targetHeightMeters が null で scale が不正なら検出する', () => {
    const config = { ...base, targetHeightMeters: null, scale: 0 };
    expect(validateConfig(config).some((i) => i.includes('scale が不正'))).toBe(true);
  });
});

describe('applyLatLonOverride', () => {
  const base = normalizeConfig({
    id: 'heigawa-suimon',
    latitude: 39.6395435045501,
    longitude: 141.96414846972124,
  });

  it('lat/lon 両方が有効な数値なら上書きする', () => {
    const params = new URLSearchParams('lat=35.6895&lon=139.6917');
    const result = applyLatLonOverride(base, params);
    expect(result.latitude).toBe(35.6895);
    expect(result.longitude).toBe(139.6917);
  });

  it('lat/lon が指定されていなければそのまま返す', () => {
    const result = applyLatLonOverride(base, new URLSearchParams());
    expect(result).toBe(base);
  });

  it('片方だけの指定は無視する', () => {
    const result = applyLatLonOverride(base, new URLSearchParams('lat=35.6895'));
    expect(result).toBe(base);
  });

  it('数値でない値は無視する', () => {
    const result = applyLatLonOverride(base, new URLSearchParams('lat=abc&lon=139.6917'));
    expect(result).toBe(base);
  });
});
