/** Verify the actual artifact or live base URL; this does not measure real-world AR accuracy. */
import { readFile, open } from 'node:fs/promises';
import path from 'node:path';
import { validatePlacementConfig } from '../src/ar-engines/place/placement';

const args = process.argv.slice(2);
const flags = new Set(['--url', '--dir', '--expect', '--commit']);
for (let i = 0; i < args.length; i += 2) {
  if (!flags.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('使い方: --url URL または --dir DIR、--expect demo|production、任意で --commit COMMIT');
}
function option(name: string) { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; }
const live = option('--url');
const directory = path.resolve(option('--dir') ?? 'dist');
const expected = option('--expect') ?? 'production';
const commit = option('--commit');
if (commit && !/^[a-f0-9]{7,40}$/i.test(commit)) throw new Error('--commit は7〜40桁のコミットIDを指定してください。');
if (!['demo', 'production'].includes(expected) || (live && option('--dir'))) throw new Error('--expect demo|production と --url URL または --dir dist を指定してください。');
const base = live ? new URL(live.endsWith('/') ? live : live + '/') : null;
let failures = 0;
async function check<T>(label: string, action: () => Promise<T>): Promise<T | undefined> {
  try { const result = await action(); console.log(`OK: ${label}`); return result; }
  catch (error) { failures++; console.error(`NG: ${label}: ${error instanceof Error ? error.message : error}`); return undefined; }
}
async function get(relative: string) {
  if (!base) return readFile(path.join(directory, relative.endsWith('/') ? relative + 'index.html' : relative), 'utf8');
  const response = await fetch(new URL(relative, base), { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.url}`);
  return response.text();
}
async function absent(relative: string) {
  if (!base) {
    try { await readFile(path.join(directory, relative.endsWith('/') ? relative + 'index.html' : relative)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    throw new Error('検証専用ファイルが本番に残っています。');
  }
  const response = await fetch(new URL(relative, base), { signal: AbortSignal.timeout(20000) });
  if (response.status !== 404 && response.status !== 410) throw new Error(`期待値404/410、実際HTTP ${response.status}（SPAの200フォールバックも不可）`);
  await response.body?.cancel();
}
async function modelHeader(relative: string) {
  let bytes: Uint8Array;
  if (!base) {
    const file = await open(path.join(directory, relative));
    try { bytes = Buffer.alloc(12); const result = await file.read(bytes, 0, 12, 0); if (result.bytesRead !== 12) throw new Error('GLBヘッダーがありません。'); }
    finally { await file.close(); }
  } else {
    const response = await fetch(new URL(relative, base), { headers: { Range: 'bytes=0-11' }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`モデル HTTP ${response.status}`);
    const reader = response.body!.getReader();
    const chunks: number[] = [];
    try {
      while (chunks.length < 12) { const { done, value } = await reader.read(); if (done) break; chunks.push(...value.slice(0, 12 - chunks.length)); }
    } finally { await reader.cancel(); }
    bytes = Uint8Array.from(chunks);
  }
  if (bytes.length !== 12 || Buffer.from(bytes.slice(0, 4)).toString() !== 'glTF' || new DataView(bytes.buffer, bytes.byteOffset, 12).getUint32(4, true) !== 2) throw new Error('GLB v2ではありません（HTMLの404代替ページなど）。');
}

const info = await check('ビルド情報と対象環境', async () => {
  const value = JSON.parse(await get('build-info.json'));
  if (value.schemaVersion !== 1 || typeof value.includeLab !== 'boolean') throw new Error('対応するビルド情報がありません。');
  if (value.includeLab !== (expected === 'demo')) throw new Error(`期待環境${expected}とincludeLab=${value.includeLab}が不一致。`);
  if (base && value.basePath.replace(/\/?$/, '/') !== base.pathname) throw new Error('配信URLのベースパスとビルドのbasePathが不一致。');
  if (commit && (!value.commit?.startsWith(commit) || value.hasTrackedChanges !== false)) throw new Error('指定コミットと成果物が一致しません（または作業差分あり）。');
  console.log(`  commit=${value.commit ?? '不明'} base=${value.basePath} builtAt=${value.builtAt}`);
  if (value.hasTrackedChanges) console.log('  注意: 未コミットの追跡対象差分を含むビルドです。');
  return value;
});
for (const route of ['ar/place/', 'viewer/']) await check(`${route} の実際のHTML`, async () => {
  if (!(await get(route)).includes('id="placement"')) throw new Error('水門ページではありません。');
});
await check('平面ARのサイズ設定', async () => validatePlacementConfig(JSON.parse(await get('config/placement.json'))));
for (const id of expected === 'demo' ? ['heigawa-suimon', 'lab-chiiki2'] : ['heigawa-suimon']) {
  await check(`${id} の設定とGLB`, async () => {
    const config = JSON.parse(await get(`config/locations/${id}.json`));
    if (!/^\/models\/[^?#]+\.glb$/.test(config.modelPath) || config.modelPath.includes('..')) throw new Error('モデルのローカルパスが不正です。');
    if (expected === 'production' && config.debug !== false) throw new Error('本番設定のdebugがfalseではありません。');
    await modelHeader(config.modelPath.slice(1));
  });
}
if (expected === 'production') for (const relative of ['lab/', 'config/locations/lab-chiiki2.json', 'models/lab-chiiki2.glb']) await check(`${relative} 非公開`, () => absent(relative));
if (info) console.log('実機では別途、20cmの定規・接地・60秒のドリフト・追跡復帰を確認してください。');
if (failures) { console.error(`${failures}項目が不合格です。`); process.exitCode = 1; }
