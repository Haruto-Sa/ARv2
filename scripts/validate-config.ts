/**
 * Stage1 CI チェック: public/config/locations/*.json が正規スキーマを満たすか検証する。
 * `normalizeConfig`/`validateConfig` は src/lib/config/locationConfig.ts と共有し、
 * 検証ロジックを二重管理しない。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normalizeConfig, validateConfig } from '../src/lib/config/locationConfig.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const locationsDir = path.join(__dirname, '..', 'public', 'config', 'locations');

const files = readdirSync(locationsDir).filter((f) => f.endsWith('.json') && f !== 'index.json');

if (files.length === 0) {
  console.error(`[validate-config] ${locationsDir} に *.json が見つかりません`);
  process.exit(1);
}

let hasError = false;

for (const file of files) {
  const fullPath = path.join(locationsDir, file);
  const raw = JSON.parse(readFileSync(fullPath, 'utf-8'));
  const config = normalizeConfig(raw);
  const issues = validateConfig(config);

  if (issues.length > 0) {
    hasError = true;
    console.error(`[validate-config] ${file}:`);
    for (const issue of issues) console.error(`  - ${issue}`);
  } else {
    console.log(`[validate-config] ${file}: OK`);
  }
}

if (hasError) {
  process.exit(1);
}
