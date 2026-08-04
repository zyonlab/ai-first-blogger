export function readingTime(body: string) {
  const words = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .trim()
    .split(/\s+|(?=[\u4e00-\u9fa5])/)
    .filter(Boolean).length;

  return Math.max(1, Math.ceil(words / 350));
}
