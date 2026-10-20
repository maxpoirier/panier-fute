// Writes a content hash of the app into public/sw.js, replacing `const VERSION = 'dev';`. Run at deploy time only, so
// phones are prompted to update exactly when an app file changed. Usage: node scripts/stamp-version.mjs [publicDir]
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VERSION_LINE = /^const VERSION = '[^']*';$/m;

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

export async function appHash(publicDir) {
  const hash = createHash('sha256');
  for (const file of await listFiles(publicDir)) {
    hash.update(relative(publicDir, file));
    hash.update(await readFile(file));
  }
  return hash.digest('hex').slice(0, 12);
}

export async function stampVersion(publicDir) {
  const swPath = join(publicDir, 'sw.js');
  const source = await readFile(swPath, 'utf8');
  if (!VERSION_LINE.test(source)) throw new Error(`No "const VERSION = '…';" line in ${swPath}`);
  const version = await appHash(publicDir);
  await writeFile(swPath, source.replace(VERSION_LINE, `const VERSION = '${version}';`));
  return version;
}

// Run as a script (not imported by a test). pathToFileURL encodes spaces and accents the way import.meta.url does.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await stampVersion(process.argv[2] ?? 'public'));
}
