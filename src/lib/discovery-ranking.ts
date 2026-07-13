import type { DiscoveryItem } from './discovery';

function relationMatches(relations: string[], item: DiscoveryItem) {
  return relations.includes(item.id) || relations.includes(item.slug);
}

export function relatedScore(current: DiscoveryItem, candidate: DiscoveryItem) {
  if (current.id === candidate.id) return 0;

  let score = 0;
  if (relationMatches(current.explicitRelations, candidate) || relationMatches(candidate.explicitRelations, current)) score += 100;
  if (current.series && current.series === candidate.series) score += 50;
  if (current.topic && current.topic === candidate.topic) score += 25;

  const currentTags = new Set(current.tags.map((tag) => tag.toLocaleLowerCase()));
  score += candidate.tags.filter((tag) => currentTags.has(tag.toLocaleLowerCase())).length * 12;
  return score;
}

export function rankRelatedContent(items: DiscoveryItem[], current: DiscoveryItem, limit = 4) {
  return items
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => ({ candidate, score: relatedScore(current, candidate) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || right.candidate.timestamp - left.candidate.timestamp)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

export function getContentNeighbors(items: DiscoveryItem[], current: DiscoveryItem) {
  const candidates = items.filter((item) => {
    if (item.id === current.id || item.kind !== current.kind) return false;
    if (current.series) return item.series === current.series;
    return Boolean(current.topic && item.topic === current.topic);
  });

  const ordered = candidates.concat(current).sort((left, right) => {
    if (current.series) {
      return (left.seriesOrder ?? Number.MAX_SAFE_INTEGER) - (right.seriesOrder ?? Number.MAX_SAFE_INTEGER)
        || left.timestamp - right.timestamp;
    }
    return left.timestamp - right.timestamp;
  });
  const index = ordered.findIndex(({ id }) => id === current.id);

  return {
    previous: index > 0 ? ordered[index - 1] : undefined,
    next: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : undefined,
  };
}
