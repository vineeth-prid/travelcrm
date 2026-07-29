/**
 * Fails the build when it produced no runnable output.
 *
 * `tsc` can exit 0 having emitted nothing — it trusts its incremental cache
 * without checking that the files it recorded are still on disk, so a wiped
 * dist/ plus a surviving cache yields a "successful" build of zero files. That
 * used to surface much later as PM2 reporting `Script not found: dist/main.js`.
 *
 * The tsBuildInfoFile now lives inside dist/ so the two cannot desynchronise;
 * this is the seatbelt for anything else that produces the same shape of
 * failure, such as a changed outDir.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(apiRoot, 'dist');
const entrypoint = join(dist, 'main.js');

function fail(reason) {
  console.error(`\nBuild verification failed: ${reason}`);
  console.error('Try a clean rebuild:\n  rm -rf apps/api/dist && npm run build -w @travel-crm/api\n');
  process.exit(1);
}

if (!existsSync(dist)) {
  fail('apps/api/dist does not exist');
}

if (!existsSync(entrypoint)) {
  const count = readdirSync(dist).length;
  fail(`apps/api/dist/main.js is missing (dist contains ${count} entries)`);
}

if (statSync(entrypoint).size === 0) {
  fail('apps/api/dist/main.js is empty');
}
