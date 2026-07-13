const postFiles = import.meta.glob("/src/content/posts/**/*.{md,mdx}");
const videoFiles = import.meta.glob("/src/content/videos/**/*.{md,mdx}");
const projectFiles = import.meta.glob("/src/content/projects/**/*.{md,mdx}");
const caseStudyFiles = import.meta.glob("/src/content/case-studies/**/*.{md,mdx}");

export type ContentBucket = "posts" | "videos" | "projects" | "caseStudies";

export const contentAvailability: Record<ContentBucket, boolean> = {
  posts: Object.keys(postFiles).length > 0,
  videos: Object.keys(videoFiles).length > 0,
  projects: Object.keys(projectFiles).length > 0,
  caseStudies: Object.keys(caseStudyFiles).length > 0,
};
