import type { SearchResult, SearchSortMode, SearchSource } from '../types';
import { diceCoefficient } from '../services/match-service';

export const SEARCH_PAGE_LIMITS: Readonly<Record<SearchSource, number>> = Object.freeze({
  youtube: 20,
  spotify: 10,
  soundcloud: 10,
  local: 50,
  playlist: 50,
});

export function createSearchRequestIdGenerator(initialValue = 0): () => number {
  let current = Math.max(0, Math.floor(initialValue));
  return () => {
    current += 1;
    return current;
  };
}

export function isCurrentSearchRequest(activeRequestId: number, eventRequestId: number): boolean {
  return activeRequestId === eventRequestId;
}

export class SearchProviderQueryAliases {
  private readonly aliases = new Map<string, string>();

  constructor(private readonly maxEntries = 64) {}

  resolve(source: SearchSource, query: string): string {
    return this.aliases.get(this.key(source, query)) ?? canonicalizeSearchQuery(query);
  }

  remember(source: SearchSource, originalQuery: string, effectiveQuery: string): void {
    const key = this.key(source, originalQuery);
    this.aliases.delete(key);
    this.aliases.set(key, canonicalizeSearchQuery(effectiveQuery));
    while (this.aliases.size > this.maxEntries) {
      const oldestKey = this.aliases.keys().next().value;
      if (!oldestKey) break;
      this.aliases.delete(oldestKey);
    }
  }

  forget(source: SearchSource, query: string): void {
    this.aliases.delete(this.key(source, query));
  }

  clear(): void {
    this.aliases.clear();
  }

  private key(source: SearchSource, query: string): string {
    return `${source}:${canonicalizeSearchQuery(query).toLowerCase()}`;
  }
}

const PRESENTATION_TOKEN_PATTERN = /\b(?:official|music\s+video|lyric(?:s|\s+video)?|audio|visuali[sz]er|hd|4k)\b/giu;
const PRESENTATION_ONLY_GROUP_PATTERN = /[([]\s*(?:official(?:\s+music)?\s+video|official\s+audio|music\s+video|lyric(?:s|\s+video)?|audio|visuali[sz]er|hd|4k)\s*[)\]]/giu;
const MEANINGFUL_VARIANTS = ['live', 'remix', 'mashup', 'acoustic'] as const;

/** Normalize user input without discarding words that may carry search meaning. */
export function canonicalizeSearchQuery(query: string): string {
  return query
    .normalize('NFKC')
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/[\uFF08\u2768\u276A]/g, '(')
    .replace(/[\uFF09\u2769\u276B]/g, ')')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Drop only presentation labels for the single zero-result provider retry. */
export function relaxSearchQuery(query: string): string {
  return canonicalizeSearchQuery(query)
    .replace(PRESENTATION_ONLY_GROUP_PATTERN, ' ')
    .replace(PRESENTATION_TOKEN_PATTERN, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/\s+([)\]])/g, '$1')
    .replace(/([([])\s+/g, '$1')
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .trim();
}

export function getSearchPageLimit(source: SearchSource, requested?: number): number {
  const providerLimit = SEARCH_PAGE_LIMITS[source];
  if (requested == null || !Number.isFinite(requested)) return providerLimit;
  return Math.max(1, Math.min(providerLimit, Math.floor(requested)));
}

export function createSearchPageRequest(
  source: SearchSource,
  requestedLimit?: number,
  requestedOffset = 0,
): { limit: number; offset: number } {
  return {
    limit: getSearchPageLimit(source, requestedLimit),
    offset: Number.isFinite(requestedOffset) ? Math.max(0, Math.floor(requestedOffset)) : 0,
  };
}

export function tokenizeSearchQuery(query: string): string[] {
  const tokens = canonicalizeSearchQuery(query).match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  return tokens.filter((token) => /[\p{L}\p{N}]/u.test(token));
}

/** Build a tolerant FTS5 prefix expression. Whitespace is OR, never implicit AND. */
export function buildSearchFtsQuery(query: string): string {
  const uniqueTokens = Array.from(new Set(tokenizeSearchQuery(query).map((token) => token.toLowerCase())));
  return uniqueTokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(' OR ');
}

function normalizeComparisonText(value: string): string {
  return canonicalizeSearchQuery(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(PRESENTATION_ONLY_GROUP_PATTERN, ' ')
    .replace(PRESENTATION_TOKEN_PATTERN, ' ')
    .replace(/\b(?:feat(?:uring)?|ft)\.?\s*/giu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function tokenCoverage(queryTokens: string[], candidateTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const candidateSet = new Set(candidateTokens);
  return queryTokens.filter((token) => candidateSet.has(token)).length / queryTokens.length;
}

function orderedTokenCoverage(queryTokens: string[], candidateTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  let nextIndex = 0;
  let matches = 0;
  for (const token of queryTokens) {
    const index = candidateTokens.indexOf(token, nextIndex);
    if (index < 0) continue;
    matches++;
    nextIndex = index + 1;
  }
  return matches / queryTokens.length;
}

function meaningfulVariantAdjustment(query: string, candidate: string): number {
  let adjustment = 0;
  const queryTokens = query.split(' ');
  const candidateTokens = candidate.split(' ');
  for (const variant of MEANINGFUL_VARIANTS) {
    const queryHasVariant = queryTokens.includes(variant);
    const candidateHasVariant = candidateTokens.includes(variant);
    if (queryHasVariant === candidateHasVariant) continue;
    adjustment -= queryHasVariant ? 0.18 : 0.08;
  }
  return adjustment;
}

/** Public, stable relevance score. It changes order only and is never a filter. */
export function searchRelevanceScore(result: SearchResult, query: string): number {
  const normalizedQuery = normalizeComparisonText(query);
  if (!normalizedQuery) return 0;

  const title = normalizeComparisonText(result.title ?? '');
  const artist = normalizeComparisonText(result.artist ?? '');
  const album = normalizeComparisonText(result.album ?? '');
  const combined = normalizeComparisonText(`${result.artist ?? ''} ${result.title ?? ''}`);
  const queryTokens = normalizedQuery.split(' ');
  const candidateTokens = combined.split(' ').filter(Boolean);

  let score = (
    diceCoefficient(normalizedQuery, title) * 0.38
    + diceCoefficient(normalizedQuery, combined) * 0.28
    + diceCoefficient(normalizedQuery, album) * 0.06
    + tokenCoverage(queryTokens, candidateTokens) * 0.18
    + orderedTokenCoverage(queryTokens, candidateTokens) * 0.10
  );

  if (title === normalizedQuery) score += 0.45;
  if (combined === normalizedQuery || `${title} ${artist}` === normalizedQuery) score += 0.5;
  if (title.includes(normalizedQuery)) score += 0.16;
  if (combined.includes(normalizedQuery)) score += 0.2;
  score += meaningfulVariantAdjustment(normalizedQuery, `${title} ${artist} ${album}`);

  return score;
}

function isLocalResult(result: SearchResult): boolean {
  return result.source === 'local' || result.source === 'playlist';
}

/** Stable ranking; local status is used only when relevance is exactly tied. */
export function rankSearchResults(results: SearchResult[], query: string): SearchResult[] {
  return results
    .map((result, index) => ({ result, index, score: searchRelevanceScore(result, query) }))
    .sort((left, right) => {
      const relevance = right.score - left.score;
      if (Math.abs(relevance) > 1e-9) return relevance;
      const localTieBreak = Number(isLocalResult(right.result)) - Number(isLocalResult(left.result));
      if (localTieBreak !== 0) return localTieBreak;
      return left.index - right.index;
    })
    .map(({ result }) => result);
}

export function parseYouTubeViewCount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replace(/\u00A0/g, ' ');
  const match = normalized.match(/([\d.,]+)\s*([KMB])?/);
  if (!match) return null;
  const suffix = match[2] ?? '';
  const numeric = suffix
    ? Number(match[1].replace(',', '.'))
    : Number(match[1].replace(/[,.](?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const multiplier = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : suffix === 'B' ? 1_000_000_000 : 1;
  return Math.round(numeric * multiplier);
}

export function sortSearchResults(
  results: SearchResult[],
  mode: SearchSortMode,
): SearchResult[] {
  if (mode === 'relevance') return results;
  return results
    .map((result, index) => ({ result, index }))
    .sort((left, right) => {
      const leftViews = left.result.view_count;
      const rightViews = right.result.view_count;
      const leftKnown = typeof leftViews === 'number' && Number.isFinite(leftViews);
      const rightKnown = typeof rightViews === 'number' && Number.isFinite(rightViews);
      if (leftKnown !== rightKnown) return rightKnown ? 1 : -1;
      if (leftKnown && rightKnown && rightViews !== leftViews) return rightViews - leftViews;
      return left.index - right.index;
    })
    .map(({ result }) => result);
}
