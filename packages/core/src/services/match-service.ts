/**
 * Spotify → YouTube matching service.
 *
 * Scores YouTube search results against a Spotify track's metadata
 * using title similarity (Dice coefficient) and duration proximity.
 * Pure TypeScript - shared between desktop and mobile.
 */

export interface MatchCandidate {
  id: string;
  title: string;
  artist: string;
  duration_ms: number | null;
  thumbnail_url?: string | null;
  url: string;
}

export interface MatchInput {
  title: string;
  artist: string;
  duration_ms: number;
}

const TITLE_WEIGHT = 0.55;
const ARTIST_WEIGHT = 0.2;
const DURATION_WEIGHT = 0.25;
const MIN_SCORE = 0.35;
const DURATION_TOLERANCE_MS = 12_000;
const EXTRA_VARIANT_PENALTY = 0.18;
const VARIANT_PATTERNS = [
  /\bremix\b/i,
  /\blive\b/i,
  /\bslowed\b/i,
  /\bsped\s*up\b/i,
  /\bnightcore\b/i,
  /\bcover\b/i,
  /\bkaraoke\b/i,
  /\binstrumental\b/i,
  /\bacoustic\b/i,
  /\breverb(?:ed)?\b/i,
  /\bbass\s*boosted\b/i,
  /\b8d\b/i,
];

/**
 * Find the best YouTube match for a Spotify track.
 * Returns null if no candidate passes the minimum score threshold.
 */
export function findBestMatch(
  input: MatchInput,
  candidates: MatchCandidate[],
): MatchCandidate | null {
  if (candidates.length === 0) return null;

  const inputTitle = normalizeTitle(input.title);
  const inputArtist = normalizeTitle(input.artist);
  const inputText = normalizeTitle(`${input.artist} - ${input.title}`);
  let bestScore = -1;
  let bestCandidate: MatchCandidate | null = null;

  for (const candidate of candidates) {
    const candidateText = normalizeTitle(`${candidate.artist} - ${candidate.title}`);
    const titleOnlyScore = diceCoefficient(inputTitle, normalizeTitle(candidate.title));
    const combinedTitleScore = diceCoefficient(inputText, candidateText);
    const titleScore = Math.max(titleOnlyScore, combinedTitleScore);
    const artistScore = inputArtist && candidate.artist
      ? diceCoefficient(inputArtist, normalizeTitle(candidate.artist))
      : 0.5;

    let durationScore = 0.5; // Default when duration unavailable
    if (candidate.duration_ms != null && input.duration_ms > 0) {
      const diff = Math.abs(input.duration_ms - candidate.duration_ms);
      durationScore = Math.max(0, 1 - diff / DURATION_TOLERANCE_MS);
    }

    const extraVariantCount = VARIANT_PATTERNS.filter((pattern) => (
      pattern.test(candidate.title) && !pattern.test(input.title)
    )).length;
    const variantPenalty = Math.min(0.36, extraVariantCount * EXTRA_VARIANT_PENALTY);
    const score = (
      TITLE_WEIGHT * titleScore
      + ARTIST_WEIGHT * artistScore
      + DURATION_WEIGHT * durationScore
      - variantPenalty
    );

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return bestScore >= MIN_SCORE ? bestCandidate : null;
}

/**
 * Normalize a title for comparison.
 * Strips common noise: "(Official Video)", "(Lyrics)", "feat.", "ft.", etc.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(official\s*(music\s*)?video\)/gi, '')
    .replace(/\(official\s*audio\)/gi, '')
    .replace(/\(lyric(s)?\s*video\)/gi, '')
    .replace(/\(lyrics?\)/gi, '')
    .replace(/\(audio\)/gi, '')
    .replace(/\(visuali[sz]er\)/gi, '')
    .replace(/\[official\s*(music\s*)?video\]/gi, '')
    .replace(/\[lyrics?\]/gi, '')
    .replace(/\bfeat\.?\s*/gi, '')
    .replace(/\bft\.?\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Dice coefficient on character bigrams.
 * Returns a value between 0 (no similarity) and 1 (identical).
 */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bigram = a.substring(i, i + 2);
    bigramsA.set(bigram, (bigramsA.get(bigram) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bigram = b.substring(i, i + 2);
    const count = bigramsA.get(bigram);
    if (count && count > 0) {
      intersection++;
      bigramsA.set(bigram, count - 1);
    }
  }

  return (2 * intersection) / (a.length - 1 + b.length - 1);
}
