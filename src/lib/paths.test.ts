import { describe, it, expect } from 'vitest';
import { withBase } from './paths';

describe('withBase', () => {
  it('先頭スラッシュ付きパスを base と結合する', () => {
    expect(withBase('/models/suimon-kousin.glb')).toBe('/models/suimon-kousin.glb');
  });

  it('先頭スラッシュなしパスも同様に結合する', () => {
    expect(withBase('config/locations/index.json')).toBe('/config/locations/index.json');
  });
});
