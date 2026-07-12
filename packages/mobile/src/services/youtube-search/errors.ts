export type YouTubeResolverStage =
  | 'candidate'
  | 'decipher'
  | 'player'
  | 'probe'
  | 'visitor';

export class YouTubeResolverError extends Error {
  readonly canRefresh: boolean;
  readonly stage: YouTubeResolverStage;
  readonly status: number | null;
  readonly strategy: string;

  constructor(options: {
    canRefresh?: boolean;
    message: string;
    stage: YouTubeResolverStage;
    status?: number | null;
    strategy: string;
  }) {
    super(options.message);
    this.name = 'YouTubeResolverError';
    this.canRefresh = options.canRefresh ?? false;
    this.stage = options.stage;
    this.status = options.status ?? null;
    this.strategy = options.strategy;
  }
}

export function isYouTubeResolverError(error: unknown): error is YouTubeResolverError {
  return error instanceof YouTubeResolverError;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
