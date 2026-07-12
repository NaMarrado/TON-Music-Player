import type { Tray } from 'electron';

let tray: Tray | null = null;
let currentTitle = 'TON';
let downloadInfo = '';

export function getTray(): Tray | null {
  return tray;
}

export function setTray(nextTray: Tray | null): void {
  tray = nextTray;
}

export function getCurrentTitle(): string {
  return currentTitle;
}

export function setCurrentTitle(nextTitle: string): void {
  currentTitle = nextTitle || 'TON';
}

export function getDownloadInfo(): string {
  return downloadInfo;
}

export function setDownloadInfo(nextInfo: string): void {
  downloadInfo = nextInfo;
}
