import { BrowserWindow } from 'electron';
import { getDb } from '../services/database';
import {
  DESKTOP_UI_SCALE_DEFAULT,
  DESKTOP_UI_SCALE_SETTING_KEY,
  normalizeDesktopUiScale,
} from '../../src/shared/ui-scale';
import {
  DESKTOP_MIN_WINDOW_HEIGHT,
  DESKTOP_MIN_WINDOW_WIDTH,
} from '../../src/shared/layout';

export function readDesktopUiScale(): number {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(
    DESKTOP_UI_SCALE_SETTING_KEY,
  ) as { value: string } | undefined;
  return normalizeDesktopUiScale(row?.value ?? DESKTOP_UI_SCALE_DEFAULT);
}

export function applyDesktopUiScale(window: BrowserWindow, value: unknown): number {
  const scale = normalizeDesktopUiScale(value);
  const factor = scale / 100;
  window.webContents.setZoomFactor(factor);

  const minimumWidth = Math.round(DESKTOP_MIN_WINDOW_WIDTH * factor);
  const minimumHeight = Math.round(DESKTOP_MIN_WINDOW_HEIGHT * factor);
  window.setMinimumSize(minimumWidth, minimumHeight);

  const [width, height] = window.getSize();
  if (width < minimumWidth || height < minimumHeight) {
    window.setSize(Math.max(width, minimumWidth), Math.max(height, minimumHeight), true);
  }
  return scale;
}

export function persistDesktopUiScale(value: unknown): number {
  const scale = normalizeDesktopUiScale(value);
  getDb().prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
  ).run(DESKTOP_UI_SCALE_SETTING_KEY, String(scale));
  return scale;
}
