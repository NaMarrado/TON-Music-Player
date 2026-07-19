export const DESKTOP_UI_SCALE_SETTING_KEY = 'desktop_ui_scale';
export const DESKTOP_UI_SCALE_MIN = 75;
export const DESKTOP_UI_SCALE_MAX = 150;
export const DESKTOP_UI_SCALE_STEP = 1;
export const DESKTOP_UI_SCALE_DEFAULT = 100;

export function normalizeDesktopUiScale(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DESKTOP_UI_SCALE_DEFAULT;
  const stepped = Math.round(parsed / DESKTOP_UI_SCALE_STEP) * DESKTOP_UI_SCALE_STEP;
  return Math.min(DESKTOP_UI_SCALE_MAX, Math.max(DESKTOP_UI_SCALE_MIN, stepped));
}
