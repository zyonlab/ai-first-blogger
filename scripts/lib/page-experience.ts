import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

type BudgetEntry = {
  path: string;
  timings: Array<{ metric: string; budget: number }>;
  resourceSizes: Array<{ resourceType: string; budget: number }>;
  resourceCounts: Array<{ resourceType: string; budget: number }>;
};

type PageExperienceConfig = {
  schemaVersion: number;
  measurement: { formFactor: string; runs: number; aggregation: string };
  representativeTemplates: Array<{ id: string; source: string; path: string }>;
  lighthouseBudgets: BudgetEntry[];
  deterministicChecks: Record<string, string>;
};

export type PageExperienceResult = {
  errors: string[];
  warnings: string[];
  checkedTemplates: string[];
  checkedRenderedPages: number;
};

const requiredTemplates = new Set(['home', 'article', 'video', 'profile']);
const requiredTimingMetrics = new Set([
  'first-contentful-paint',
  'largest-contentful-paint',
  'cumulative-layout-shift',
  'total-blocking-time',
]);

async function walk(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(target) : [target];
    }));
    return nested.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function positiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function parseAttributes(tag: string) {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function checkRenderedImages(html: string, label: string, errors: string[]) {
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const src = attributes.get('src') ?? '(unknown source)';
    if (!attributes.has('width') || !attributes.has('height')) {
      errors.push(`${label}: rendered image ${src} must include width and height to reserve layout space`);
    }
  }
}

function checkSourceImages(source: string, label: string, errors: string[]) {
  for (const match of source.matchAll(/<img\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    if (!attributes.has('width') || !attributes.has('height')) {
      errors.push(`${label}: literal <img> must include width and height`);
    }
  }
}

export function validatePageExperienceConfig(config: unknown, root: string): string[] {
  const errors: string[] = [];
  if (!config || typeof config !== 'object') return ['page experience config must be an object'];
  const candidate = config as Partial<PageExperienceConfig>;
  if (candidate.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (candidate.measurement?.formFactor !== 'mobile') errors.push('measurement.formFactor must be mobile');
  if (!Number.isInteger(candidate.measurement?.runs) || (candidate.measurement?.runs ?? 0) < 3) {
    errors.push('measurement.runs must be at least 3');
  }
  if (candidate.measurement?.aggregation !== 'median') errors.push('measurement.aggregation must be median');

  const templates = candidate.representativeTemplates ?? [];
  const seen = new Set<string>();
  for (const template of templates) {
    if (!requiredTemplates.has(template.id)) errors.push(`unknown representative template: ${template.id}`);
    if (seen.has(template.id)) errors.push(`duplicate representative template: ${template.id}`);
    seen.add(template.id);
    if (!template.path?.startsWith('/')) errors.push(`${template.id}: path must be root-relative`);
    if (!template.source || path.isAbsolute(template.source) || template.source.includes('..')) {
      errors.push(`${template.id}: source must be a repository-relative path`);
    }
  }
  for (const id of requiredTemplates) {
    if (!seen.has(id)) errors.push(`missing representative template: ${id}`);
  }

  const budgets = candidate.lighthouseBudgets ?? [];
  if (budgets.length === 0) errors.push('at least one Lighthouse budget is required');
  for (const budget of budgets) {
    if (!budget.path?.startsWith('/')) errors.push('Lighthouse budget path must be root-relative');
    const metrics = new Set((budget.timings ?? []).map((item) => item.metric));
    for (const metric of requiredTimingMetrics) {
      if (!metrics.has(metric)) errors.push(`${budget.path}: missing timing budget ${metric}`);
    }
    for (const item of [...(budget.timings ?? []), ...(budget.resourceSizes ?? []), ...(budget.resourceCounts ?? [])]) {
      if (!positiveNumber(item.budget)) errors.push(`${budget.path}: every budget must be a positive number`);
    }
  }

  for (const template of templates) {
    if (template.source && !path.isAbsolute(template.source)) {
      const normalized = path.resolve(root, template.source);
      if (!normalized.startsWith(`${path.resolve(root)}${path.sep}`)) errors.push(`${template.id}: source escapes repository root`);
    }
  }
  return errors;
}

export async function loadPageExperienceConfig(root: string): Promise<PageExperienceConfig> {
  const source = await fs.readFile(path.join(root, 'content-plans/page-experience-budgets.yaml'), 'utf8');
  return parse(source) as PageExperienceConfig;
}

export function toLighthouseBudgets(config: PageExperienceConfig): BudgetEntry[] {
  return config.lighthouseBudgets;
}

export async function validatePageExperience(root: string, distDirectory?: string): Promise<PageExperienceResult> {
  const config = await loadPageExperienceConfig(root);
  const errors = validatePageExperienceConfig(config, root);
  const warnings: string[] = [];
  const checkedTemplates: string[] = [];

  for (const template of config.representativeTemplates ?? []) {
    const file = path.join(root, template.source);
    try {
      const source = await fs.readFile(file, 'utf8');
      checkSourceImages(source, template.source, errors);
      checkedTemplates.push(template.id);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') errors.push(`${template.id}: source does not exist: ${template.source}`);
      else throw error;
    }
  }

  const cssPath = path.join(root, 'src/styles/global.css');
  const css = await fs.readFile(cssPath, 'utf8');
  if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)/i.test(css)) {
    errors.push('global.css: missing prefers-reduced-motion: reduce override');
  }
  if (!/animation-duration\s*:\s*0\.0?1ms\s*!important/i.test(css)) {
    errors.push('global.css: reduced motion must minimize animation duration');
  }
  if (!/transition-duration\s*:\s*0\.0?1ms\s*!important/i.test(css)) {
    errors.push('global.css: reduced motion must minimize transition duration');
  }
  if (!/scroll-behavior\s*:\s*auto\s*!important/i.test(css)) {
    errors.push('global.css: reduced motion must disable smooth scrolling');
  }
  if (!/:focus-visible\b/i.test(css) || !/outline\s*:/i.test(css)) {
    errors.push('global.css: missing visible :focus-visible outline');
  }
  if (!/\.prose\s+:is\([^)]*h2[^)]*\)\[id\][^{]*\{[^}]*scroll-margin-top/is.test(css)) {
    errors.push('global.css: anchored prose headings must define scroll-margin-top');
  }

  const toc = await fs.readFile(path.join(root, 'src/components/Toc.astro'), 'utf8');
  if (!/href=\{`#\$\{heading\.slug\}`\}/.test(toc)) errors.push('Toc.astro: heading links must target rendered heading ids');

  const embed = await fs.readFile(path.join(root, 'src/components/YouTubeEmbed.astro'), 'utf8');
  if (!/class=["']youtube-embed["']/.test(embed) || !/\.youtube-embed\s*\{[^}]*aspect-ratio\s*:/s.test(css)) {
    errors.push('YouTubeEmbed: media container must reserve an aspect ratio');
  }

  const sourceFiles = (await walk(path.join(root, 'src'))).filter((file) => /\.(?:astro|md|mdx)$/.test(file));
  for (const file of sourceFiles) {
    const source = await fs.readFile(file, 'utf8');
    checkSourceImages(source, path.relative(root, file), errors);
  }

  let checkedRenderedPages = 0;
  if (distDirectory) {
    const htmlFiles = (await walk(distDirectory)).filter((file) => file.endsWith('.html'));
    if (htmlFiles.length === 0) warnings.push(`no rendered HTML found in ${path.relative(root, distDirectory) || distDirectory}`);
    for (const file of htmlFiles) {
      checkRenderedImages(await fs.readFile(file, 'utf8'), path.relative(root, file), errors);
      checkedRenderedPages += 1;
    }
  }

  return { errors: [...new Set(errors)], warnings, checkedTemplates, checkedRenderedPages };
}
