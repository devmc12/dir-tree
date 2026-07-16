import { execFileSync } from 'node:child_process';
import { parseNpmPackResult } from './parse-npm-pack-result.mjs';

/**
 * Date: 2026-06-07
 * Desc: Verifies npm pack output stays limited to headless package files
 */

const allowedExactFiles = new Set([
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'README.zh.md',
  'package.json',
]);

const forbiddenPrefixes = [
  'playground/',
  'playground-node/',
  'resources/',
  'scripts/',
  'src/',
  'test/',
];
const npmExecPath = process.env.npm_execpath;
const packCommand = npmExecPath ? process.execPath : 'npm';
const packArgs = npmExecPath
  ? [npmExecPath, 'pack', '--dry-run', '--json']
  : ['pack', '--dry-run', '--json'];

const rawPackOutput = execFileSync(packCommand, packArgs, {
  encoding: 'utf8',
  env: {
    ...process.env,
    npm_config_cache: process.env.DIR_TREE_NPM_CACHE ?? '.npm-cache',
  },
});
const packResult = parseNpmPackResult(rawPackOutput);
const files = packResult.files.map(file => file.path);
const invalidFiles = files.filter(file => {
  if (file.startsWith('dist/')) {
    return false;
  }

  if (allowedExactFiles.has(file)) {
    return false;
  }

  return true;
});
const forbiddenFiles = files.filter(file => {
  return forbiddenPrefixes.some(prefix => file.startsWith(prefix));
});

if (invalidFiles.length > 0 || forbiddenFiles.length > 0) {
  console.error('Unexpected files in npm pack output');
  console.error(
    JSON.stringify(
      {
        invalidFiles,
        forbiddenFiles,
      },
      null,
      2
    )
  );
  process.exit(1);
}

console.log(`Verified npm pack boundary with ${files.length} files`);
