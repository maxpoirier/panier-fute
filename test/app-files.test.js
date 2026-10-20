import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { appHash, stampVersion } from '../scripts/stamp-version.mjs';

const PUBLIC = new URL('../public/', import.meta.url).pathname;
// Not needed by the running app: the service worker itself, and the font licences shipped alongside the fonts.
const NOT_CACHED = [/^sw\.js$/, /^fonts\/OFL-.*\.txt$/];

async function swSource() {
  return readFile(join(PUBLIC, 'sw.js'), 'utf8');
}

async function appFiles() {
  const source = await swSource();
  const list = source.slice(source.indexOf('const APP_FILES = ['), source.indexOf('];', source.indexOf('const APP_FILES = [')));
  return [...list.matchAll(/'\.\/([^']*)'/g)].map((match) => match[1]);
}

test('every app file is cached for offline use, and every cached file exists', async () => {
  const entries = await readdir(PUBLIC, { withFileTypes: true, recursive: true });
  const onDisk = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(PUBLIC, join(entry.parentPath, entry.name)))
    .filter((file) => !NOT_CACHED.some((pattern) => pattern.test(file)));
  const cached = await appFiles();
  for (const file of onDisk) assert.ok(cached.includes(file), `${file} is missing from APP_FILES in sw.js`);
  for (const file of cached.filter(Boolean)) assert.ok(onDisk.includes(file), `APP_FILES lists ${file}, which doesn't exist`);
});

test('the deploy step can stamp the version, and the hash only changes with the app', async () => {
  assert.match(await swSource(), /^const VERSION = 'dev';$/m, 'sw.js must keep the placeholder; the deploy replaces it');
  const dir = await mkdtemp(join(tmpdir(), 'panier-'));
  try {
    await cp(PUBLIC, dir, { recursive: true });
    const before = await appHash(dir);
    assert.equal(await appHash(dir), before, 'stable for the same files');
    await writeFile(join(dir, 'app.js'), `${await readFile(join(dir, 'app.js'), 'utf8')}\n// changed\n`);
    const version = await stampVersion(dir);
    assert.notEqual(version, before, 'changes when an app file changes');
    assert.match(await readFile(join(dir, 'sw.js'), 'utf8'), new RegExp(`^const VERSION = '${version}';$`, 'm'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
