// Deploy step: ties the app version (public/version.js, shown at the top right of the app) to the service worker, so
// phones are prompted to update exactly when that version changes, and the update screen can show it.
//
// It refuses to deploy changed app files under an already-published version number: it compares a content hash of
// public/ with build.json on the live site, which this script also writes.
//
// Usage: node scripts/stamp-version.mjs <publicDir> [liveSiteUrl]
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VERSION_LINE = /^const VERSION = '[^']*';$/m;
const APP_VERSION_LINE = /^export const APP_VERSION = '([^']+)';$/m;

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

/** Fingerprint of the app files as committed (before stamping), to detect a change without a version bump. */
export async function appHash(publicDir) {
  const hash = createHash('sha256');
  for (const file of await listFiles(publicDir)) {
    if (relative(publicDir, file) === 'build.json') continue;
    hash.update(relative(publicDir, file));
    hash.update(await readFile(file));
  }
  return hash.digest('hex').slice(0, 12);
}

export async function readAppVersion(publicDir) {
  const source = await readFile(join(publicDir, 'version.js'), 'utf8');
  const version = source.match(APP_VERSION_LINE)?.[1];
  if (!version) throw new Error(`No "export const APP_VERSION = '…';" line in ${join(publicDir, 'version.js')}`);
  return version;
}

/**
 * @param {{ version: string, hash: string } | null} live What's deployed now (null on the first deploy).
 * @param {{ version: string, hash: string }} next What's about to be deployed.
 * @returns {string | null} Why the deploy must stop, or null.
 */
export function checkVersionBump(live, next) {
  if (live && live.hash !== next.hash && live.version === next.version) {
    return (
      `Les fichiers de l'app ont changé, mais la version est toujours ${next.version} (déjà en ligne). ` +
      `Augmente-la dans public/version.js et package.json, sinon les téléphones ne verront pas la mise à jour.`
    );
  }
  return null;
}

/** Writes the version into sw.js and build.json. */
export async function stampVersion(publicDir, version, hash) {
  const swPath = join(publicDir, 'sw.js');
  const source = await readFile(swPath, 'utf8');
  if (!VERSION_LINE.test(source)) throw new Error(`No "const VERSION = '…';" line in ${swPath}`);
  await writeFile(swPath, source.replace(VERSION_LINE, `const VERSION = '${version}';`));
  await writeFile(join(publicDir, 'build.json'), `${JSON.stringify({ version, hash })}\n`);
}

async function fetchLiveBuild(siteUrl) {
  const response = await fetch(new URL('build.json', siteUrl), { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Can't read the live build.json (${response.status})`);
  return response.json();
}

// Run as a script (not imported by a test). pathToFileURL encodes spaces and accents the way import.meta.url does.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [publicDir = 'public', siteUrl] = process.argv.slice(2);
  const next = { version: await readAppVersion(publicDir), hash: await appHash(publicDir) };
  const live = siteUrl ? await fetchLiveBuild(siteUrl) : null;
  const problem = checkVersionBump(live, next);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  await stampVersion(publicDir, next.version, next.hash);
  console.log(`Version ${next.version} (${next.hash})${live ? `, en ligne : ${live.version}` : ''}`);
}
