import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { appHash, checkVersionBump, readAppVersion, stampVersion } from '../scripts/stamp-version.mjs';

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

test('the deploy stamps the version from version.js into the service worker', async () => {
  assert.match(await swSource(), /^const VERSION = 'dev';$/m, 'sw.js must keep the placeholder; the deploy replaces it');
  const dir = await mkdtemp(join(tmpdir(), 'panier-'));
  try {
    await cp(PUBLIC, dir, { recursive: true });
    const version = await readAppVersion(dir);
    const hash = await appHash(dir);
    assert.equal(await appHash(dir), hash, 'the fingerprint is stable for the same files');

    await stampVersion(dir, version, hash);
    assert.match(await readFile(join(dir, 'sw.js'), 'utf8'), new RegExp(`^const VERSION = '${version.replaceAll('.', '\\.')}';$`, 'm'));
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'build.json'), 'utf8')), { version, hash });

    await writeFile(join(dir, 'app.js'), `${await readFile(join(dir, 'app.js'), 'utf8')}\n// changed\n`);
    assert.notEqual(await appHash(dir), hash, 'the fingerprint changes when an app file changes');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the deploy refuses changed app files under a version that is already live', () => {
  const live = { version: '1.1.0', hash: 'aaa' };
  assert.equal(checkVersionBump(null, { version: '1.1.0', hash: 'aaa' }), null, 'first deploy');
  assert.equal(checkVersionBump(live, { version: '1.1.0', hash: 'aaa' }), null, 'nothing changed in the app (e.g. README only)');
  assert.equal(checkVersionBump(live, { version: '1.2.0', hash: 'bbb' }), null, 'changed and bumped');
  assert.match(checkVersionBump(live, { version: '1.1.0', hash: 'bbb' }), /Augmente-la dans public\/version\.js/, 'changed but not bumped');
});

test('the version shown in the app matches package.json', async () => {
  const { APP_VERSION } = await import('../public/version.js');
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(APP_VERSION, version);
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
});
