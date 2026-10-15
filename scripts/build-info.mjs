import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function buildInfo() {
  let basePath = '/';
  return {
    name: 'placement-build-info',
    hooks: {
      'astro:config:done': ({ config }) => { basePath = config.base; },
      'astro:build:done': ({ dir }) => {
        let commit = null;
        let hasTrackedChanges = null;
        try {
          const cwd = fileURLToPath(new URL('../', import.meta.url));
          commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
          hasTrackedChanges = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd, encoding: 'utf8' }).trim();
        } catch { /* Archives may not contain Git metadata. */ }
        const info = { schemaVersion: 1, commit, hasTrackedChanges, builtAt: new Date().toISOString(),
          basePath, includeLab: /^(1|true)$/i.test(process.env.INCLUDE_LAB ?? '') };
        writeFileSync(new URL('build-info.json', dir), JSON.stringify(info, null, 2) + '\n');
      },
    },
  };
}
