import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNpmPackResult } from './parse-npm-pack-result.mjs';

/**
 * Date: 2026-06-07
 * Desc: Verifies the packed package in isolated runtime and TypeScript consumers
 */

const workspaceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath ? process.execPath : 'npm';
const consumerNode = process.env.DIR_TREE_CONSUMER_NODE ?? process.execPath;
const tscPath = join(workspaceRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const npmEnv = {
  ...process.env,
  npm_config_cache:
    process.env.DIR_TREE_NPM_CACHE ??
    process.env.npm_config_cache ??
    join(workspaceRoot, '.npm-cache'),
};

const runtimeFixtures = [
  'esm-smoke.mjs',
  'cjs-smoke.cjs',
  'cross-entry-smoke.mjs',
  'additive-api-smoke.mjs',
];
const nodeFixtures = ['node-types-smoke.mts', 'node-types-smoke.cts'];
const browserFixture = 'browser-types-smoke.mts';

/**
 * Runs npm with the same executable that launched the smoke command
 */
function runNpm(args, cwd, stdio = 'pipe') {
  return execFileSync(npmCommand, npmExecPath ? [npmExecPath, ...args] : args, {
    cwd,
    encoding: 'utf8',
    env: npmEnv,
    stdio,
  });
}

/**
 * Runs a strict declaration check without imposing Node types on browser consumers
 */
function checkTypes(cwd, module, moduleResolution, files, browser = false) {
  const config = 'tsconfig.' + moduleResolution.toLowerCase() + '.json';
  const compilerOptions = {
    exactOptionalPropertyTypes: true,
    lib: browser ? ['DOM', 'ES2022'] : ['ES2022'],
    module,
    moduleResolution,
    noEmit: true,
    skipLibCheck: false,
    strict: true,
    target: 'ES2022',
    types: browser ? [] : ['node'],
    typeRoots: [join(workspaceRoot, 'node_modules', '@types')],
  };

  writeFileSync(join(cwd, config), JSON.stringify({ compilerOptions, files }));
  execFileSync(process.execPath, [tscPath, '--project', config], {
    cwd,
    stdio: 'inherit',
  });
}

const smokeRoot = mkdtempSync(
  join(realpathSync(tmpdir()), 'dir-tree-install-smoke-')
);

try {
  const pack = parseNpmPackResult(
    runNpm(['pack', '--json', '--pack-destination', smokeRoot], workspaceRoot)
  );
  const tarball = join(smokeRoot, pack.filename);
  writeFileSync(
    join(smokeRoot, 'package.json'),
    JSON.stringify({ name: 'dir-tree-install-smoke', private: true })
  );
  runNpm(
    [
      'install',
      tarball,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--prefer-offline',
    ],
    smokeRoot,
    'inherit'
  );

  for (const file of [...runtimeFixtures, ...nodeFixtures, browserFixture]) {
    copyFileSync(
      new URL('./fixtures/' + file, import.meta.url),
      join(smokeRoot, file)
    );
  }

  const version = execFileSync(consumerNode, ['--version'], {
    encoding: 'utf8',
  }).trim();
  for (const file of runtimeFixtures) {
    execFileSync(consumerNode, [file], { cwd: smokeRoot, stdio: 'inherit' });
  }
  console.log(
    'Verified installed package runtime on ' + process.platform + ' ' + version
  );

  checkTypes(smokeRoot, 'Node16', 'Node16', nodeFixtures);
  checkTypes(smokeRoot, 'NodeNext', 'NodeNext', nodeFixtures);
  checkTypes(smokeRoot, 'ESNext', 'Bundler', [browserFixture], true);
  console.log(
    'Verified strict Node and browser declarations from the installed package'
  );
} finally {
  rmSync(smokeRoot, { force: true, recursive: true });
}
