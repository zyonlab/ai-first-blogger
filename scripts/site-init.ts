import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { z } from 'zod';

const publicUrl = z.union([z.literal(''), z.url()]);
const nonEmptyList = z.array(z.string().trim().min(1)).min(1);

const contentPillarSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  formats: nonEmptyList,
  exampleTopics: nonEmptyList,
});

const seriesSchema = z.strictObject({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1),
  readerOutcome: z.string().trim().min(1),
  plannedArticles: nonEmptyList,
});

const periodPlanSchema = z.strictObject({
  theme: z.string().trim().min(1),
  goals: nonEmptyList,
  deliverables: nonEmptyList,
});

export const siteIntakeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  site: z.strictObject({
    name: z.string().trim().min(1),
    alternateName: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    url: z.url(),
    locale: z.string().trim().min(2),
    themeStorageKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    defaultImage: z.string().startsWith('/'),
    brand: z.strictObject({
      initial: z.string().trim().min(1),
      tagline: z.string().trim().min(1),
      keywords: nonEmptyList,
    }),
    author: z.strictObject({
      name: z.string().trim().min(1),
      title: z.string().trim().min(1),
      bio: z.string().trim().min(1),
      email: z.union([z.literal(''), z.email()]),
    }),
    social: z.strictObject({
      github: publicUrl,
      youtube: publicUrl,
      x: publicUrl,
      linkedin: publicUrl,
    }),
    hero: z.strictObject({
      eyebrow: z.string().trim().min(1),
      title: z.string().trim().min(1),
      description: z.string().trim().min(1),
      actions: z.array(z.strictObject({
        label: z.string().trim().min(1),
        href: z.string().startsWith('/'),
        variant: z.literal('primary').optional(),
      })),
      signals: nonEmptyList,
    }),
    services: z.strictObject({
      title: z.string().trim().min(1),
      description: z.string().trim().min(1),
      serviceName: z.string().trim().min(1),
      serviceTypes: nonEmptyList,
      contactText: z.string().trim().min(1),
    }),
  }),
  strategy: z.strictObject({
    purpose: z.string().trim().min(1),
    positioning: z.string().trim().min(1),
    audience: z.strictObject({
      primary: nonEmptyList,
      secondary: z.array(z.string().trim().min(1)),
    }),
    voice: nonEmptyList,
    contentDomains: nonEmptyList,
    informationArchitecture: z.strictObject({
      writing: z.string().trim().min(1),
      series: z.string().trim().min(1),
      topics: z.string().trim().min(1),
      videos: z.string().trim().min(1),
      projects: z.string().trim().min(1),
      caseStudies: z.string().trim().min(1),
    }),
    contentPillars: z.array(contentPillarSchema).min(1),
    seriesRoadmap: z.array(seriesSchema),
    githubProjectStrategy: z.strictObject({
      goal: z.string().trim().min(1),
      pagePattern: nonEmptyList,
      contentReuse: nonEmptyList,
    }),
    videoStrategy: z.strictObject({
      goal: z.string().trim().min(1),
      pagePattern: nonEmptyList,
      recommendedCadence: nonEmptyList,
    }),
    seoGeoRules: nonEmptyList,
    ninetyDayPlan: z.strictObject({
      month1: periodPlanSchema,
      month2: periodPlanSchema,
      month3: periodPlanSchema,
    }),
    maintenanceCadence: z.strictObject({
      weekly: nonEmptyList,
      monthly: nonEmptyList,
      quarterly: nonEmptyList,
    }),
  }),
});

export type SiteIntake = z.infer<typeof siteIntakeSchema>;

const targetPaths = ['src/data/site.ts', 'content-plans/site-plan.yaml'] as const;

function renderSiteConfig(site: SiteIntake['site']) {
  const { url, ...configuredValues } = site;
  return `import { z } from "zod";

const configuredSiteUrl = import.meta.env.PUBLIC_SITE_URL?.trim();
const optionalUrl = z.union([z.literal(""), z.url()]);

const siteConfigSchema = z.object({
  name: z.string().min(1),
  alternateName: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  url: z.url(),
  locale: z.string().min(2),
  themeStorageKey: z.string().min(1),
  defaultImage: z.string().startsWith("/"),
  brand: z.object({
    initial: z.string().min(1),
    tagline: z.string().min(1),
    keywords: z.array(z.string().min(1)).min(1),
  }),
  author: z.object({
    name: z.string().min(1),
    title: z.string().min(1),
    bio: z.string().min(1),
    email: z.union([z.literal(""), z.email()]),
  }),
  social: z.object({
    github: optionalUrl,
    youtube: optionalUrl,
    x: optionalUrl,
    linkedin: optionalUrl,
  }),
  hero: z.object({
    eyebrow: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    actions: z.array(z.object({
      label: z.string().min(1),
      href: z.string().startsWith("/"),
      variant: z.enum(["primary"]).optional(),
    })),
    signals: z.array(z.string().min(1)),
  }),
  services: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    serviceName: z.string().min(1),
    serviceTypes: z.array(z.string().min(1)),
    contactText: z.string().min(1),
  }),
});

const siteConfig = {
  ...${JSON.stringify(configuredValues, null, 2)},
  url: configuredSiteUrl || ${JSON.stringify(url)},
};

export const site = siteConfigSchema.parse(siteConfig);

export type SiteConfig = typeof site;
`;
}

function renderSitePlan(intake: SiteIntake) {
  const { site, strategy } = intake;
  const plan = {
    site: {
      brand_name: site.name,
      purpose: strategy.purpose,
      positioning: strategy.positioning,
      audience: strategy.audience,
      voice: strategy.voice,
    },
    brand_inputs: {
      known: {
        brand_name: site.name,
        author_or_team_name: site.author.name,
        content_domains: strategy.contentDomains,
        public_site_url: site.url,
        public_contact_email: site.author.email,
        social_links: site.social,
      },
      missing: [],
    },
    information_architecture: {
      writing: strategy.informationArchitecture.writing,
      series: strategy.informationArchitecture.series,
      topics: strategy.informationArchitecture.topics,
      videos: strategy.informationArchitecture.videos,
      projects: strategy.informationArchitecture.projects,
      case_studies: strategy.informationArchitecture.caseStudies,
    },
    content_pillars: strategy.contentPillars.map((pillar) => ({
      id: pillar.id,
      name: pillar.name,
      goal: pillar.goal,
      formats: pillar.formats,
      example_topics: pillar.exampleTopics,
    })),
    series_roadmap: strategy.seriesRoadmap.map((series) => ({
      slug: series.slug,
      title: series.title,
      reader_outcome: series.readerOutcome,
      planned_articles: series.plannedArticles,
    })),
    github_project_strategy: {
      goal: strategy.githubProjectStrategy.goal,
      page_pattern: strategy.githubProjectStrategy.pagePattern,
      content_reuse: strategy.githubProjectStrategy.contentReuse,
    },
    video_strategy: {
      goal: strategy.videoStrategy.goal,
      page_pattern: strategy.videoStrategy.pagePattern,
      recommended_cadence: strategy.videoStrategy.recommendedCadence,
    },
    seo_geo_rules: strategy.seoGeoRules,
    '90_day_plan': {
      month_1: strategy.ninetyDayPlan.month1,
      month_2: strategy.ninetyDayPlan.month2,
      month_3: strategy.ninetyDayPlan.month3,
    },
    maintenance_cadence: strategy.maintenanceCadence,
  };
  return stringify(plan, { lineWidth: 100 });
}

export function renderSiteFiles(intake: SiteIntake) {
  return {
    'src/data/site.ts': renderSiteConfig(intake.site),
    'content-plans/site-plan.yaml': renderSitePlan(intake),
  } satisfies Record<(typeof targetPaths)[number], string>;
}

async function readExisting(filePath: string) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function digest(content: string | undefined) {
  return content === undefined ? null : createHash('sha256').update(content).digest('hex').slice(0, 12);
}

export async function initializeSite(options: {
  root: string;
  intake: SiteIntake;
  dryRun: boolean;
  confirmOverwrite: boolean;
}) {
  const rendered = renderSiteFiles(options.intake);
  const changes = await Promise.all(targetPaths.map(async (relativePath) => {
    const next = rendered[relativePath];
    const current = await readExisting(path.join(options.root, relativePath));
    return {
      relativePath,
      current,
      next,
      changed: current !== next,
      status: current === undefined ? 'create' : current === next ? 'unchanged' : 'overwrite',
    } as const;
  }));

  const unsafeOverwrites = changes.filter((change) => change.status === 'overwrite');
  if (!options.dryRun && unsafeOverwrites.length > 0 && !options.confirmOverwrite) {
    const files = unsafeOverwrites.map((change) => change.relativePath).join(', ');
    throw new Error(`Refusing to overwrite existing configuration: ${files}. Review with --dry-run, then pass --confirm-overwrite.`);
  }

  if (options.dryRun) {
    return {
      mode: 'dry-run' as const,
      changes: changes.map((change) => ({
        path: change.relativePath,
        status: change.status,
        currentSha256: digest(change.current),
        generatedSha256: digest(change.next),
        generatedContent: change.next,
      })),
    };
  }

  for (const change of changes) {
    if (!change.changed) continue;
    const destination = path.join(options.root, change.relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.afb-init-${process.pid}`;
    await fs.writeFile(temporary, change.next, { encoding: 'utf8', mode: 0o644 });
    await fs.rename(temporary, destination);
  }

  return {
    mode: 'write' as const,
    changes: changes.map((change) => ({ path: change.relativePath, status: change.status })),
  };
}

function option(argumentsList: string[], name: string) {
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : undefined;
}

async function main() {
  const argumentsList = process.argv.slice(2).filter((argument) => argument !== '--');
  const inputPath = option(argumentsList, '--input');
  if (!inputPath) {
    throw new Error('Missing required --input <intake.json>. This command only accepts complete non-interactive intake data.');
  }

  const root = path.resolve(process.env.AI_FIRST_BLOGGER_ROOT ?? process.cwd());
  const source = await fs.readFile(path.resolve(inputPath), 'utf8');
  const parsedJson = JSON.parse(source) as unknown;
  const intake = siteIntakeSchema.parse(parsedJson);
  const result = await initializeSite({
    root,
    intake,
    dryRun: argumentsList.includes('--dry-run'),
    confirmOverwrite: argumentsList.includes('--confirm-overwrite'),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
