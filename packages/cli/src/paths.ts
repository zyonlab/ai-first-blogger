/**
 * Where the engine's own files are, in whichever layout this is.
 *
 * The rules that read engine source used to build their paths by joining
 * `process.cwd()` with `packages/engine/…`. That is the layout of this
 * repository and of nothing else: a site scaffolded by `npm create aifb` has
 * the engine at `node_modules/aifb-engine`, so every one of those paths pointed
 * at a directory that did not exist. Each read was wrapped in a bare catch, so
 * nothing ever failed — C-13 simply scanned zero files and reported a pass for
 * the life of every installed site. A gate that is green because it looked at
 * nothing is worse than one that crashes.
 *
 * Module resolution is the only thing that answers "where is this package"
 * correctly in both layouts, and it is the same question the integration
 * already asks of `injectRoute`. `createRequire` rather than
 * `import.meta.resolve`: it is synchronous, it is typed under this project's
 * module settings, and it walks the same `exports` map — `aifb-engine` exports
 * `./package.json` precisely so a consumer can find the package root without
 * importing code from it.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { root } from 'aifb-engine/config/load';

const resolver = createRequire(import.meta.url);

let cached: string | undefined;

/**
 * The root of the installed `aifb-engine`.
 *
 * Throws rather than returning a guess. A rule that scans engine files has to
 * be able to tell "found nothing" from "could not look", because only one of
 * those is a pass.
 */
export function engineRoot() {
  if (cached !== undefined) return cached;
  try {
    cached = path.dirname(resolver.resolve('aifb-engine/package.json'));
  } catch (error) {
    throw new Error(
      `aifb-engine could not be resolved from ${import.meta.url}: ${(error as Error).message}`,
    );
  }
  return cached;
}

/** A path inside the engine package. */
export const enginePath = (...parts: string[]) => path.join(engineRoot(), ...parts);

/**
 * A path written the way whoever has to fix it will look for it: relative to
 * the project root when it is under it — `node_modules/aifb-engine/…` included,
 * because that is genuinely where an installed site's copy lives — and absolute
 * when it is not.
 */
export function displayPath(absolute: string) {
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return absolute;
  return relative.split(path.sep).join('/');
}
