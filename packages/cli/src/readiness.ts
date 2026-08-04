/**
 * Planning preflight — is this site planned enough to publish anything?
 *
 * The content gate answers "is this article publishable". It cannot answer the
 * question that comes first: *is there a site to publish it into*. An article
 * validated against an unplanned site passes rules that mean nothing — its
 * category belongs to a skeleton taxonomy, its canonical points at a
 * placeholder domain, and the voice it was written against is a stub.
 *
 * So this runs before the gate, and a failure stops the pipeline rather than
 * adding to the violation list. Publishing into an unplanned site is not a
 * content defect; it is doing the steps in the wrong order.
 *
 * ## Two kinds of check, and why they are different
 *
 * **Unfilled placeholders.** `site/` ships as a skeleton in which every value a
 * person must decide is literally marked `TODO`. Detection is therefore reading
 * the file, not comparing it against a snapshot of what the template shipped.
 * That matters: a value is unconfigured because it *says* it is unconfigured,
 * visible when you open the file and visible on the rendered page — not because
 * a hash somewhere still matches.
 *
 * **Structural checks.** Things that can be wrong in a fully-written site too:
 * a theme-color that disagrees with the theme, an OG image that does not exist,
 * a voice written for a different language than the site publishes in, a
 * content type missing from llms.txt. These are product guarantees, and they
 * apply for the life of the site, not just at setup.
 *
 * Escape hatch: `planning.acknowledged` in site/policy.yaml opts an area out
 * explicitly, and the opt-out is printed on every run. Deliberate is fine;
 * silent is not.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { siteContentTypes } from 'aifb-engine/config/content-types';
import { policy } from 'aifb-engine/config/policy';
import { site } from 'aifb-engine/config/site';
import { series, topicList, topics } from 'aifb-engine/config/taxonomy';
import { voice } from 'aifb-engine/config/voice';
import { FRAMEWORK_FAVICON_MARK } from './brand';

export type ReadinessArea = 'identity' | 'domain' | 'copy' | 'taxonomy' | 'template' | 'voice' | 'ai';

export type ReadinessIssue = {
  area: ReadinessArea;
  severity: 'error' | 'warn';
  /** Where to fix it. */
  key: string;
  message: string;
  fix: string;
  /** `placeholder` = a decision never made. `structural` = a decision made wrongly. */
  kind: 'placeholder' | 'structural';
};

/** The marker that means "a person still has to decide this". */
export const TODO_MARKER = 'TODO';

const root = process.cwd();

async function readFile(file: string) {
  try {
    return await fs.readFile(path.join(root, file), 'utf8');
  } catch {
    return '';
  }
}

async function exists(file: string) {
  try {
    await fs.access(path.join(root, file));
    return true;
  } catch {
    return false;
  }
}

/**
 * Every `key: value` line still carrying the marker, with its line number and
 * the top-level block it sits under. The block is what lets one file report
 * into several areas: a missing `author.name` and a missing `hero.description`
 * are both in site.yaml but they are not the same kind of decision.
 */
function unfilled(source: string) {
  const out: { line: number; key: string; text: string; section: string }[] = [];
  let section = '';

  source.split('\n').forEach((text, index) => {
    const top = /^([A-Za-z_][\w-]*)\s*:/.exec(text);
    if (top) section = top[1]!;
    if (text.trimStart().startsWith('#') || !text.includes(TODO_MARKER)) return;
    out.push({
      line: index + 1,
      key: /^\s*-?\s*([A-Za-z_][\w-]*)\s*:/.exec(text)?.[1] ?? text.trim().slice(0, 40),
      text: text.trim(),
      section,
    });
  });

  return out;
}

/** Which area a placeholder belongs to, by file and by top-level block. */
const FILE_AREAS: {
  file: string;
  what: string;
  area: ReadinessArea | ((section: string) => ReadinessArea);
}[] = [
  {
    file: 'site/site.yaml',
    what: 'who publishes this site, where it lives, and how it introduces itself',
    area: (section) => {
      if (section === 'url') return 'domain';
      if (section === 'theme' || section === 'og') return 'template';
      if (['brand', 'hero', 'services', 'nav'].includes(section)) return 'copy';
      return 'identity';
    },
  },
  { file: 'site/taxonomy.yaml', area: 'taxonomy', what: 'what the site is about' },
  { file: 'site/content-types.yaml', area: 'taxonomy', what: 'what kinds of thing it publishes' },
  { file: 'site/pages.yaml', area: 'copy', what: 'the pages a reader checks before trusting it' },
];

export async function checkReadiness(): Promise<ReadinessIssue[]> {
  const issues: ReadinessIssue[] = [];
  const add = (
    area: ReadinessArea,
    severity: 'error' | 'warn',
    kind: 'placeholder' | 'structural',
    key: string,
    message: string,
    fix: string,
  ) => issues.push({ area, severity, kind, key, message, fix });

  /* ---------------------------------------------------------------- *
   * 1. Unfilled placeholders — decisions never made
   * ---------------------------------------------------------------- */

  for (const { file, area, what } of FILE_AREAS) {
    for (const item of unfilled(await readFile(file))) {
      add(
        typeof area === 'function' ? area(item.section) : area,
        'error',
        'placeholder',
        `${file}:${item.line} → ${item.key}`,
        `Still a placeholder: ${item.text}`,
        `Decide it. This file is ${what}.`,
      );
    }
  }

  const voiceFile = `site/${policy.style.voice}`;
  const voiceRaw = await readFile(voiceFile);
  for (const item of unfilled(voiceRaw)) {
    add('voice', 'error', 'placeholder', `${voiceFile}:${item.line} → ${item.key}`, `Still a placeholder: ${item.text}`, 'Decide it. The prose half of this file is what a writing agent reads before drafting.');
  }
  if (matter(voiceRaw).content.includes(TODO_MARKER)) {
    add('voice', 'error', 'placeholder', voiceFile, 'The guidance prose is still a stub.', 'Write how this site sounds. Leaving it means every article is drafted against nothing.');
  }

  /* ---------------------------------------------------------------- *
   * 2. Structural — decisions made, but made wrongly
   * ---------------------------------------------------------------- */

  /* identity ------------------------------------------------------- */
  for (const [network, url] of Object.entries(site.social ?? {})) {
    if (typeof url !== 'string' || url.includes(TODO_MARKER)) continue;
    try {
      const parsed = new URL(url);
      if (parsed.pathname === '/' || parsed.pathname === '') {
        add('identity', 'warn', 'structural', `site/site.yaml → social.${network}`, `"${url}" is a bare domain, not a profile.`, 'A sameAs pointing at a network\'s home page claims an identity it does not prove. Use the profile URL, or drop the key.');
      }
    } catch {
      add('identity', 'error', 'structural', `site/site.yaml → social.${network}`, `"${url}" is not a URL.`, 'Use an absolute profile URL, or remove the key.');
    }
  }

  /* domain --------------------------------------------------------- */
  const workflow = await readFile('.github/workflows/cloudflare-pages.yml');
  // Read the env values, not the file: the workflow also contains the shell
  // guard that compares against the literal REPLACE_ME, and matching that
  // would report a site as unplanned forever.
  const project = /^\s*CLOUDFLARE_PAGES_PROJECT_NAME:\s*(\S+)/m.exec(workflow)?.[1];
  const declared = /^\s*PUBLIC_SITE_URL:\s*(\S+)/m.exec(workflow)?.[1];

  if (workflow && (project?.includes('REPLACE_ME') || declared?.includes('REPLACE_ME'))) {
    add('domain', 'error', 'placeholder', '.github/workflows/cloudflare-pages.yml', 'CLOUDFLARE_PAGES_PROJECT_NAME / PUBLIC_SITE_URL are still REPLACE_ME.', 'Set both. Until then the workflow refuses to deploy, so nothing you publish goes anywhere.');
  } else if (declared && !site.url.startsWith(declared.replace(/\/$/, ''))) {
    add('domain', 'warn', 'structural', 'site/site.yaml → url', `url is ${site.url} but CI builds with PUBLIC_SITE_URL=${declared}.`, 'The deployed canonical will differ from the one you develop against. Make them match.');
  }

  /* taxonomy ------------------------------------------------------- */
  if (topicList.length === 0) {
    add('taxonomy', 'error', 'structural', 'site/taxonomy.yaml → topics', 'No listed topics.', 'Every topic is `listed: false`, so /topics/ renders an empty page. Publish at least one real topic.');
  }

  /* template ------------------------------------------------------- */
  const themeCss = await readFile(`site/themes/${site.theme.name}.css`);
  if (!themeCss) {
    add('template', 'error', 'structural', 'site/site.yaml → theme.name', `No site/themes/${site.theme.name}.css.`, 'Point theme.name at a file that exists, or create it.');
  } else {
    // Select the blocks by what they are, not by position. Splitting on a
    // lookahead leaves the file's leading comment as element 0, which silently
    // shifted every index by one and made this whole check a no-op.
    const blocks = themeCss.split(/(?=^:root)/m).filter((block) => block.startsWith(':root'));
    const base = blocks.find((block) => !/^:root\[/.test(block));
    const alternate = blocks.find((block) => /^:root\[data-theme/.test(block));
    const rootBg = base ? /--bg:\s*([^;]+);/.exec(base)?.[1]?.trim() : undefined;
    const altBg = alternate ? /--bg:\s*([^;]+);/.exec(alternate)?.[1]?.trim() : undefined;
    const expected = site.theme.defaultMode === 'dark' ? site.theme.colorDark : site.theme.colorLight;
    if (rootBg && expected && rootBg.toLowerCase() !== expected.toLowerCase()) {
      add('template', 'error', 'structural', 'site/site.yaml → theme.colorDark / colorLight', `theme-color for the ${site.theme.defaultMode} mode is ${expected}, but the theme paints --bg: ${rootBg}.`, 'They drive the browser chrome and the page background. A mismatch shows as a visible seam on mobile before the page paints.');
    }
    if (altBg === undefined) {
      add('template', 'warn', 'structural', `site/themes/${site.theme.name}.css`, 'The theme defines no alternate-mode block.', 'Add :root[data-theme=\'…\'] so the light/dark toggle has something to switch to.');
    }
  }

  const ogPath = site.og.default.replace(/^\//, '');
  if (!(await exists(path.join('public', ogPath)))) {
    add('template', 'error', 'structural', 'site/site.yaml → og.default', `public/${ogPath} does not exist.`, 'Every share of every page falls back to this image. Run `npx aifb brand`, or drop your own 1200x630 PNG there.');
  } else if (/\.svg$/i.test(ogPath)) {
    add('template', 'error', 'structural', 'site/site.yaml → og.default', 'The fallback Open Graph image is an SVG.', 'No social platform renders SVG. Use PNG, JPG or WebP (rule C-01).');
  }

  /**
   * The favicon is still the framework's own mark.
   *
   * A scaffolded site used to ship this file verbatim, so a visitor's browser
   * tab showed the framework's logo for someone else's blog — a decision nobody
   * had made, on the single most visible piece of branding a site has. Nothing
   * errored; it is only ever wrong in someone else's repository.
   */
  const iconPath = path.join(root, 'public/favicon.svg');
  const icon = await fs.readFile(iconPath, 'utf8').catch(() => '');
  if (icon.includes(FRAMEWORK_FAVICON_MARK)) {
    add('template', 'error', 'placeholder', 'public/favicon.svg', "The favicon is still the framework's mark.", 'Run `npx aifb brand` to draw one from `brand.initial` and your theme, or replace the file with your own.');
  }

  /* voice ---------------------------------------------------------- */
  if (voice.locale && site.locale && !site.locale.toLowerCase().startsWith(voice.locale.slice(0, 2).toLowerCase())) {
    add('voice', 'error', 'structural', `${voiceFile} → locale`, `The voice is written for ${voice.locale} but the site publishes in ${site.locale}.`, 'The phrase tables only match the language they were written for — mismatched, `pnpm analyze` silently scores every article as clean. Rewrite the signals for your language.');
  }
  if (voice.avoid.length === 0 && voice.expect.length === 0) {
    add('voice', 'error', 'structural', `${voiceFile} → signals`, 'The voice declares no signals.', 'Without `avoid` or `expect` entries, `pnpm analyze` has nothing to measure and every article scores 100.');
  }

  /* ai — what this framework needs that an ordinary blog does not --- */
  for (const [name, def] of Object.entries(siteContentTypes)) {
    if (def.surfaces?.llms === undefined) {
      add('ai', 'error', 'structural', `site/content-types.yaml → ${name}.surfaces.llms`, `"${name}" is absent from llms.txt.`, 'A content type outside llms.txt is invisible to AI summarisers no matter how well it ranks. Add `llms: { limit: N }`.');
    }
    if (!(await exists(path.join('content', name)))) {
      add('ai', 'error', 'structural', `content/${name}/`, `The directory does not exist, but "${name}" is a registered type.`, 'Create it. An agent told to write this type has nowhere to put the file.');
    }
  }

  if (topicList.length + Object.keys(series).length === 0) {
    add('ai', 'warn', 'structural', 'site/taxonomy.yaml', 'There are no topic or series pages to link to.', `Rule C-02 requires ${policy.content.minInternalLinks} internal links per article, and the first article will have nowhere to point.`);
  }

  return issues;
}

/** Areas the site has explicitly opted out of, from site/policy.yaml. */
export function acknowledgedAreas(): Set<string> {
  return new Set(policy.planning.acknowledged);
}

/** Issues that actually block, after applying the acknowledgements. */
export function blockingIssues(issues: ReadinessIssue[]) {
  const acknowledged = acknowledgedAreas();
  return issues.filter((issue) => issue.severity === 'error' && !acknowledged.has(issue.area));
}
