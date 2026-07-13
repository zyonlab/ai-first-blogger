import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const root = process.env.AI_FIRST_BLOGGER_ROOT ?? process.cwd();
const roadmapFile = path.join(root, 'content-plans/ai-first-blogger-roadmap.yaml');
const roadmap = parse(await fs.readFile(roadmapFile, 'utf8')) as {
  statuses: string[];
  tasks: Array<{
    id: string;
    status: string;
    depends_on: string[];
    evidence?: string[];
  }>;
};
const issues: string[] = [];
const taskById = new Map<string, (typeof roadmap.tasks)[number]>();

for (const task of roadmap.tasks) {
  if (taskById.has(task.id)) issues.push(`${task.id}: duplicate task id`);
  taskById.set(task.id, task);
  if (!roadmap.statuses.includes(task.status)) issues.push(`${task.id}: unknown status ${task.status}`);
}

for (const task of roadmap.tasks) {
  for (const dependencyId of task.depends_on) {
    const dependency = taskById.get(dependencyId);
    if (!dependency) issues.push(`${task.id}: missing dependency ${dependencyId}`);
    if (['ready', 'complete'].includes(task.status) && dependency?.status !== 'complete') {
      issues.push(`${task.id}: ${task.status} task depends on incomplete ${dependencyId}`);
    }
  }
  if (task.status !== 'complete') continue;
  if (!task.evidence?.length) {
    issues.push(`${task.id}: complete task has no evidence`);
    continue;
  }
  for (const evidence of task.evidence) {
    try {
      await fs.access(path.join(root, evidence));
    } catch {
      issues.push(`${task.id}: evidence does not exist: ${evidence}`);
    }
  }
}

if (issues.length > 0) {
  issues.forEach((issue) => console.error(issue));
  process.exit(1);
}
console.log(`Roadmap valid: ${roadmap.tasks.length} tasks, ${roadmap.tasks.filter((task) => task.status === 'complete').length} complete.`);
