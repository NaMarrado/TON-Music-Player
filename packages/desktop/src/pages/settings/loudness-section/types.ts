export interface LoudnessStats {
  total: number;
  analyzed: number;
  missing: number;
}

export interface AnalyzeProgress {
  current: number;
  total: number;
  analyzed: number;
  failed: number;
}
