import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import matter from 'gray-matter';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const root = process.env.AI_FIRST_BLOGGER_ROOT ?? process.cwd();

const promptFiles = {
  siteIntake: 'prompts/site-intake.md',
  contentPlan: 'prompts/content-plan.md',
  articleBrief: 'prompts/article-brief.md',
  seoGeoAudit: 'prompts/seo-geo-audit.md',
  deploy: 'prompts/deploy.md',
} as const;

const workflowPromptMap = {
  setup: 'siteIntake',
  planning: 'contentPlan',
  writing: 'articleBrief',
  seoGeo: 'seoGeoAudit',
  deployment: 'deploy',
  maintenance: 'seoGeoAudit',
} as const;

type PromptName = keyof typeof promptFiles;
type WorkflowName = keyof typeof workflowPromptMap;

async function readProjectFile(relativePath: string) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function readOptionalProjectFile(relativePath: string) {
  try {
    return await readProjectFile(relativePath);
  } catch {
    return '';
  }
}

async function walkContentFiles(directory: string): Promise<string[]> {
  const absoluteDirectory = path.join(root, directory);

  try {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const relativePath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          return walkContentFiles(relativePath);
        }

        if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) {
          return [relativePath];
        }

        return [];
      }),
    );

    return files.flat().sort();
  } catch {
    return [];
  }
}

async function getContentInventory() {
  const files = await walkContentFiles('src/content');

  return Promise.all(
    files.map(async (file) => {
      const source = await readProjectFile(file);
      const parsed = matter(source);
      const collection = file.split(path.sep)[2] ?? 'unknown';

      return {
        file,
        collection,
        title: parsed.data.title ?? null,
        slug: parsed.data.slug ?? path.basename(file).replace(/\.(md|mdx)$/, ''),
        status: parsed.data.draft ? 'draft' : 'published',
        tags: parsed.data.tags ?? [],
      };
    }),
  );
}

function textResponse(text: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text,
      },
    ],
  };
}

const server = new McpServer({
  name: 'ai-first-blogger',
  version: '0.1.0',
});

server.registerResource(
  'agent-rules',
  'ai-first-blogger://agent-rules',
  {
    title: 'AI First Blogger agent rules',
    description: 'Repository rules for agents maintaining this blog framework.',
    mimeType: 'text/markdown',
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'text/markdown',
        text: await readOptionalProjectFile('AGENTS.md'),
      },
    ],
  }),
);

server.registerResource(
  'site-plan',
  'ai-first-blogger://site-plan',
  {
    title: 'AI First Blogger site plan',
    description: 'Structured editorial, SEO, GEO, and positioning plan.',
    mimeType: 'text/yaml',
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'text/yaml',
        text: await readOptionalProjectFile('content-plans/site-plan.yaml'),
      },
    ],
  }),
);

server.registerTool(
  'get_site_context',
  {
    title: 'Get site context',
    description:
      'Read the core AI First Blogger project context: agent rules, site config, content plan, and optional content inventory.',
    inputSchema: {
      includeContentInventory: z.boolean().optional().default(false),
    },
  },
  async ({ includeContentInventory }) => {
    const context = {
      root,
      files: {
        agentRules: 'AGENTS.md',
        siteConfig: 'src/data/site.ts',
        contentPlan: 'content-plans/site-plan.yaml',
        prompts: promptFiles,
      },
      agentRules: await readOptionalProjectFile('AGENTS.md'),
      siteConfig: await readOptionalProjectFile('src/data/site.ts'),
      contentPlan: await readOptionalProjectFile('content-plans/site-plan.yaml'),
      contentInventory: includeContentInventory ? await getContentInventory() : undefined,
    };

    return textResponse(JSON.stringify(context, null, 2));
  },
);

server.registerTool(
  'list_prompts',
  {
    title: 'List AI-first prompts',
    description: 'List reusable prompt templates bundled with the AI First Blogger framework.',
  },
  async () => textResponse(JSON.stringify(promptFiles, null, 2)),
);

server.registerTool(
  'read_prompt',
  {
    title: 'Read prompt template',
    description: 'Read one reusable AI First Blogger prompt template by name.',
    inputSchema: {
      name: z.enum(Object.keys(promptFiles) as [PromptName, ...PromptName[]]),
    },
  },
  async ({ name }) =>
    textResponse(
      JSON.stringify(
        {
          name,
          file: promptFiles[name],
          text: await readProjectFile(promptFiles[name]),
        },
        null,
        2,
      ),
    ),
);

server.registerTool(
  'get_workflow_contract',
  {
    title: 'Get workflow contract',
    description:
      'Return the operating contract for a setup, planning, writing, SEO/GEO, deployment, or maintenance task.',
    inputSchema: {
      workflow: z.enum(Object.keys(workflowPromptMap) as [WorkflowName, ...WorkflowName[]]),
      includeContentInventory: z.boolean().optional().default(false),
    },
  },
  async ({ workflow, includeContentInventory }) => {
    const promptName = workflowPromptMap[workflow];
    const checks = {
      setup: ['Update src/data/site.ts', 'Update content-plans/site-plan.yaml', 'Run pnpm check'],
      planning: ['Update content-plans/site-plan.yaml', 'Create briefs from prompts/article-brief.md'],
      writing: ['Write MDX in src/content/**', 'Use structured headings and internal links', 'Run pnpm check'],
      seoGeo: ['Check canonical, JSON-LD, sitemap, RSS, robots.txt, llms.txt', 'Run pnpm build'],
      deployment: ['Build dist/', 'Use GitHub Actions and Cloudflare Pages', 'Never commit secrets'],
      maintenance: ['Read current inventory', 'Identify stale content', 'Run pnpm check and pnpm build after edits'],
    } satisfies Record<WorkflowName, string[]>;

    return textResponse(
      JSON.stringify(
        {
          workflow,
          promptName,
          promptFile: promptFiles[promptName],
          promptText: await readProjectFile(promptFiles[promptName]),
          requiredFiles: ['AGENTS.md', 'src/data/site.ts', 'content-plans/site-plan.yaml'],
          checks: checks[workflow],
          contentInventory: includeContentInventory ? await getContentInventory() : undefined,
        },
        null,
        2,
      ),
    );
  },
);

server.registerTool(
  'get_content_inventory',
  {
    title: 'Get content inventory',
    description: 'List MD/MDX content files with collection, title, slug, status, and tags.',
  },
  async () => textResponse(JSON.stringify(await getContentInventory(), null, 2)),
);

server.registerTool(
  'healthcheck',
  {
    title: 'Healthcheck',
    description: 'Check that the AI First Blogger MCP server can read the expected project files.',
  },
  async () => {
    const requiredFiles = ['AGENTS.md', 'src/data/site.ts', 'content-plans/site-plan.yaml'];
    const results = await Promise.all(
      requiredFiles.map(async (file) => {
        try {
          const fileStat = await stat(path.join(root, file));
          return { file, ok: fileStat.isFile() };
        } catch {
          return { file, ok: false };
        }
      }),
    );

    return textResponse(JSON.stringify({ root, results }, null, 2));
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
