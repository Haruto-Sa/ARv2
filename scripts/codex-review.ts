/**
 * Stage2レビュー: Codex CLI をローカルで実行し、diff を批判的にレビューさせる。
 * PRを出す前に、実装者(人 or Claude Code)が worktree 内で手動実行する運用
 * (CI上でのCodex実行にはシークレット追加が要るため、現時点ではローカル専用)。
 *
 * 使い方:
 *   npm run codex-review -- --base main --round 1
 *
 * 上限3ラウンドは呼び出し側が --round を手で増やして管理する(隠れた状態ファイルは持たない)。
 * ラウンド3でも fail の場合は、PR本文に貼り付けるための固定ブロックを出力した上で
 * exit 0 とする(push は許可するが、指摘は必ずPRに残す)。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

function parseArgs(): { base: string; round: number } {
  const args = process.argv.slice(2);
  let base = 'main';
  let round = 1;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base') base = args[++i];
    if (args[i] === '--round') round = Number(args[++i]);
  }
  if (!Number.isInteger(round) || round < 1 || round > 3) {
    console.error('[codex-review] --round は 1〜3 の整数で指定してください');
    process.exit(1);
  }
  return { base, round };
}

function run(label: string, cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env): { ok: boolean; output: string } {
  console.log(`[codex-review] 実行中: ${label}`);
  const result = spawnSync(cmd, args, { cwd: repoRoot, env, encoding: 'utf-8' });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const ok = result.status === 0;
  console.log(ok ? `[codex-review] ${label}: OK` : `[codex-review] ${label}: FAILED`);
  return { ok, output };
}

function main(): void {
  const { base, round } = parseArgs();

  const diff = execFileSync(
    'git',
    ['diff', `${base}...HEAD`, '--', 'src/ar-engines', 'src/lib', 'public/config'],
    { cwd: repoRoot, encoding: 'utf-8' }
  );
  if (!diff.trim()) {
    console.log('[codex-review] 対象パス(src/ar-engines, src/lib, public/config)に差分がありません。スキップします。');
    return;
  }

  const checks = [
    run('vitest', 'npm', ['run', 'test']),
    run('build (gh-pages base)', 'npm', ['run', 'build'], { ...process.env, DEPLOY_TARGET: 'gh-pages' }),
    run('build (cloudflare base)', 'npm', ['run', 'build'], { ...process.env, DEPLOY_TARGET: '' }),
    run('validate-config', 'npm', ['run', 'validate-config']),
  ];
  const failedChecks = checks.filter((c) => !c.ok);
  if (failedChecks.length) {
    console.error('\n[codex-review] ローカルチェックが失敗しました。Codexレビューへは進みません。まずこれらを直してください。');
    process.exit(1);
  }

  const logs = checks.map((c) => c.output).join('\n---\n');
  const promptPath = path.join(__dirname, 'codex-review-prompt.md');
  const schemaPath = path.join(__dirname, 'codex-review-schema.json');
  const prompt = readFileSync(promptPath, 'utf-8');
  const stdinPayload = `## git diff (${base}...HEAD)\n\n${diff}\n\n## npm run test / build / validate-config のログ\n\n${logs}`;

  const outputFile = path.join(os.tmpdir(), `codex-review-result-${Date.now()}.json`);
  const codexArgs = [
    'exec',
    '--sandbox',
    'read-only',
    '--output-schema',
    schemaPath,
    '--output-last-message',
    outputFile,
    '-C',
    repoRoot,
    prompt,
  ];

  console.log('[codex-review] Codex CLI を起動しています…');
  const codexResult = spawnSync('codex', codexArgs, {
    cwd: repoRoot,
    input: stdinPayload,
    encoding: 'utf-8',
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  if (codexResult.status !== 0) {
    console.error('[codex-review] codex exec の実行に失敗しました');
    process.exit(1);
  }

  let parsed: { verdict: 'pass' | 'fail'; findings: Array<{ summary: string; file: string | null; severity: string }> };
  try {
    const raw = readFileSync(outputFile, 'utf-8').trim();
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error('[codex-review] Codexの出力(JSON)を読み取れませんでした:', e);
    process.exit(1);
  } finally {
    try { unlinkSync(outputFile); } catch { /* ignore */ }
  }

  console.log(`\n[codex-review] verdict: ${parsed.verdict} (round ${round}/3)`);
  for (const f of parsed.findings) {
    console.log(`  - [${f.severity ?? 'advisory'}] ${f.file ? `${f.file}: ` : ''}${f.summary}`);
  }

  if (parsed.verdict === 'pass') {
    console.log('\n[codex-review] Stage2 通過。PRを作成できます。');
    return;
  }

  if (round < 3) {
    console.error(`\n[codex-review] 指摘を修正し、再度 --round ${round + 1} で実行してください。`);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('## Stage 2: Codex Review — cap reached (3/3)');
  console.log('');
  console.log('3ラウンドの指摘往復の上限に達しました。以下の指摘は未解決のままPRに進みます:');
  console.log('');
  for (const f of parsed.findings) {
    console.log(`- [${f.severity ?? 'advisory'}] ${f.file ? `${f.file}: ` : ''}${f.summary}`);
  }
  console.log('='.repeat(60));
  console.log('\n上のブロックをそのままPR本文に貼り付けてください。pushは許可します。');
}

main();
