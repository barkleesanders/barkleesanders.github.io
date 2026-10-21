import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = await mkdtemp(path.join(tmpdir(), 'theme-watch-'));
let child;
try {
  await mkdir(path.join(root, 'assets/js'), { recursive: true });
  await copyFile('scripts/watch-js.mjs', path.join(root, 'watch.mjs'));
  await symlink(path.resolve('node_modules'), path.join(root, 'node_modules'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ scripts: { 'build:js': 'node build.cjs' } }),
  );
  await writeFile(
    path.join(root, 'build.cjs'),
    `require('fs').appendFileSync('builds.txt', 'built\\n'); require('fs').writeFileSync('assets/js/main.min.js', 'generated');`,
  );
  await writeFile(path.join(root, 'assets/js/source.js'), 'original');
  child = spawn(process.execPath, ['watch.mjs'], {
    cwd: root,
    stdio: 'inherit',
  });
  await delay(1000);
  await writeFile(path.join(root, 'assets/js/source.js'), 'changed');
  const counts = async () =>
    (await readFile(path.join(root, 'builds.txt'), 'utf8').catch(() => ''))
      .trim()
      .split('\n')
      .filter(Boolean).length;
  for (let tries = 0; tries < 50 && (await counts()) === 0; tries++)
    await delay(100);
  assert.equal(await counts(), 1, 'source edit must build once');
  await delay(700);
  assert.equal(
    await counts(),
    1,
    'generated bundle must not trigger a rebuild loop',
  );
  await writeFile(path.join(root, 'assets/js/source.js'), 'changed again');
  for (let tries = 0; tries < 50 && (await counts()) < 2; tries++)
    await delay(100);
  assert.equal(await counts(), 2, 'later source edit must build again');
  console.log('Watcher: source edits build; generated output does not loop.');
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  await rm(root, { recursive: true, force: true });
}
