/**
 * Media Element Pool - A/B dual-element pattern for gapless playback.
 *
 * Two <audio> elements alternate. While one plays, the other preloads
 * the next track. Each has its own MediaElementAudioSourceNode connected
 * to the shared signal chain.
 */

import { CUSTOM_PROTOCOL } from '@ton/core';
import { getAudioContext, getChainInput } from './engine';

interface PoolElement {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
}

let elementA: PoolElement | null = null;
let elementB: PoolElement | null = null;
let activeSlot: 'A' | 'B' = 'A';

function createPoolElement(): PoolElement {
  const audio = new Audio();
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';
  const source = getAudioContext().createMediaElementSource(audio);
  source.connect(getChainInput());
  return { audio, source };
}

export function initMediaPool(): void {
  if (elementA) return;
  elementA = createPoolElement();
  elementB = createPoolElement();
}

export function getActiveElement(): HTMLAudioElement {
  const el = activeSlot === 'A' ? elementA : elementB;
  if (!el) throw new Error('Media pool not initialized');
  return el.audio;
}

export function getPreloadElement(): HTMLAudioElement {
  const el = activeSlot === 'A' ? elementB : elementA;
  if (!el) throw new Error('Media pool not initialized');
  return el.audio;
}

export function swapElements(): void {
  // Get the currently active (about to become inactive) element
  const oldActive = activeSlot === 'A' ? elementA : elementB;
  activeSlot = activeSlot === 'A' ? 'B' : 'A';

  // Release decoded audio buffers from old element after a short delay
  // (wait for any pending ended/timeupdate events to fire)
  if (oldActive) {
    setTimeout(() => {
      oldActive.audio.removeAttribute('src');
      oldActive.audio.load();
    }, 500);
  }
}

export function buildMediaUrl(filePath: string): string {
  const encoded = encodeURIComponent(filePath);
  return `${CUSTOM_PROTOCOL}://${encoded}`;
}

export function loadTrack(filePath: string): void {
  const el = getActiveElement();
  el.src = buildMediaUrl(filePath);
  el.load();
}

export function preloadTrack(filePath: string): void {
  const el = getPreloadElement();
  el.src = buildMediaUrl(filePath);
  el.load();
}

export function destroyMediaPool(): void {
  for (const el of [elementA, elementB]) {
    if (el) {
      el.audio.pause();
      el.audio.removeAttribute('src');
      el.audio.load();
      el.source.disconnect();
    }
  }
  elementA = null;
  elementB = null;
  activeSlot = 'A';
}
