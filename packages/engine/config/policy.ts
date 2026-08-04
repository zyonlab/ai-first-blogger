/**
 * site/policy.yaml → publishing thresholds.
 *
 * The third layer between intent and mechanism: the engine ships a default for
 * every value, the site overrides the ones it disagrees with, and the overrides
 * are reported so a green run always says which numbers it was green against.
 *
 * Before this file the thresholds were constants inside the validation scripts,
 * which meant the one thing a site is most likely to want to tune was the one
 * thing it could only tune by editing the framework.
 */
import { readYaml } from './load';

const raw = readYaml<Record<string, any>>('policy.yaml');

export const DEFAULT_POLICY = {
  strict: false,
  seo: { titleMaxWidth: 60, descriptionMaxWidth: 160, descriptionMinWidth: 36, maxUrlDepth: 3, listingIntroMinWidth: 40 },
  content: {
    minInternalLinks: 2,
    /**
     * Rule C-26, in display columns of prose with code excluded. Set to catch a
     * stub, not to enforce a length: ~400 columns is roughly 200 CJK characters,
     * below which an article has not made an argument. 0 turns the rule off.
     */
    minBodyWidth: 400,
    typography: 'auto' as 'auto' | 'on' | 'off',
    typographySeverity: 'warn' as 'warn' | 'error',
    typographyMaxPerFile: 20,
    /**
     * zhlint rules, passed through as-is.
     *
     * Deliberately not `preset: 'default'`. That preset also enforces one quote
     * style per document and half-width brackets with outer spaces — defensible
     * house style, but it fires on 「」 and （）, which are ordinary in Chinese
     * technical writing. Five warnings per correct sentence is how a rule
     * teaches people to ignore it, and then its neighbours too.
     *
     * What is left are the two defects nobody argues about: a missing space
     * between CJK and Latin, and half-width punctuation in Chinese prose.
     * Want the full preset? Put `preset: default` here.
     */
    typographyRules: {
      spaceBetweenMixedwidthContent: true,
      fullwidthPunctuation: '，。；：？！',
    } as Record<string, unknown>,
  },
  style: { voice: 'voice.md', minScore: null as number | null, severity: 'warn' as 'warn' | 'error' },
  metrics: { avgInternalLinks: 3 },
  planning: { acknowledged: [] as string[] },
};

function num(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export const policy = {
  strict: typeof raw.strict === 'boolean' ? raw.strict : DEFAULT_POLICY.strict,
  seo: {
    titleMaxWidth: num(raw.seo?.titleMaxWidth, DEFAULT_POLICY.seo.titleMaxWidth),
    descriptionMaxWidth: num(raw.seo?.descriptionMaxWidth, DEFAULT_POLICY.seo.descriptionMaxWidth),
    descriptionMinWidth: num(raw.seo?.descriptionMinWidth, DEFAULT_POLICY.seo.descriptionMinWidth),
    maxUrlDepth: num(raw.seo?.maxUrlDepth, DEFAULT_POLICY.seo.maxUrlDepth),
    listingIntroMinWidth: num(raw.seo?.listingIntroMinWidth, DEFAULT_POLICY.seo.listingIntroMinWidth),
  },
  content: {
    minInternalLinks: num(raw.content?.minInternalLinks, DEFAULT_POLICY.content.minInternalLinks),
    minBodyWidth: num(raw.content?.minBodyWidth, DEFAULT_POLICY.content.minBodyWidth),
    typography: (['auto', 'on', 'off'].includes(raw.content?.typography)
      ? raw.content.typography
      : DEFAULT_POLICY.content.typography) as 'auto' | 'on' | 'off',
    typographySeverity: (raw.content?.typographySeverity === 'error'
      ? 'error'
      : DEFAULT_POLICY.content.typographySeverity) as 'warn' | 'error',
    typographyMaxPerFile: num(raw.content?.typographyMaxPerFile, DEFAULT_POLICY.content.typographyMaxPerFile),
    typographyRules:
      raw.content?.typographyRules === undefined
        ? DEFAULT_POLICY.content.typographyRules
        : (raw.content.typographyRules as Record<string, unknown>),
  },
  style: {
    voice: typeof raw.style?.voice === 'string' ? raw.style.voice : DEFAULT_POLICY.style.voice,
    minScore: typeof raw.style?.minScore === 'number' ? raw.style.minScore : null,
    severity: (raw.style?.severity === 'error' ? 'error' : DEFAULT_POLICY.style.severity) as 'warn' | 'error',
  },
  metrics: {
    avgInternalLinks: num(raw.metrics?.avgInternalLinks, DEFAULT_POLICY.metrics.avgInternalLinks),
  },
  planning: {
    acknowledged: Array.isArray(raw.planning?.acknowledged)
      ? (raw.planning.acknowledged as string[])
      : DEFAULT_POLICY.planning.acknowledged,
  },
};

export type Policy = typeof policy;

/** Values this site set differently from the shipped defaults. */
export function policyOverrides(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (actual: any, defaults: any, prefix: string) => {
    for (const key of Object.keys(defaults)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (defaults[key] !== null && typeof defaults[key] === 'object') walk(actual[key], defaults[key], path);
      else if (actual[key] !== defaults[key]) out[path] = actual[key];
    }
  };
  walk(policy, DEFAULT_POLICY, '');
  return out;
}
