import 'react-native-url-polyfill/auto';
import 'fast-text-encoding';
import { getRandomValues } from 'expo-crypto';

type PolyfillEvent = { type: string };
type Listener = (event: PolyfillEvent) => void;
type MMKVStorageOptions = { id: string };
type MMKVBuffer = { buffer: ArrayBuffer };

interface MMKVStorageLike {
  getBuffer(key: string): MMKVBuffer | undefined;
  set(key: string, value: ArrayBuffer | SharedArrayBuffer | Uint8Array): void;
  delete(key: string): void;
}

interface MMKVStorageConstructor {
  new (opts?: MMKVStorageOptions): MMKVStorageLike;
}

type PolyfilledGlobal = typeof globalThis & {
  mmkvStorage?: MMKVStorageConstructor;
};

const g = globalThis as PolyfilledGlobal & Record<string, unknown>;

if (typeof g.crypto === 'undefined') {
  g.crypto = { getRandomValues } as unknown as Crypto;
}
if (!('getRandomValues' in g.crypto) || typeof g.crypto.getRandomValues === 'undefined') {
  (
    g.crypto as unknown as { getRandomValues: typeof getRandomValues }
  ).getRandomValues = getRandomValues;
}

// EventTarget polyfill — Hermes doesn't have it, needed by youtubei.js
if (typeof g.EventTarget === 'undefined') {
  class EventTargetPolyfill {
    private _listeners: Record<string, Listener[]> = {};
    addEventListener(type: string, callback: Listener): void {
      if (!this._listeners[type]) this._listeners[type] = [];
      if (!this._listeners[type].includes(callback)) {
        this._listeners[type].push(callback);
      }
    }
    removeEventListener(type: string, callback: Listener): void {
      const list = this._listeners[type];
      if (!list) return;
      const idx = list.indexOf(callback);
      if (idx !== -1) list.splice(idx, 1);
    }
    dispatchEvent(event: { type: string }): boolean {
      const list = this._listeners[event.type];
      if (!list) return true;
      for (const listener of [...list]) listener(event);
      return true;
    }
  }
  g.EventTarget = EventTargetPolyfill as unknown as typeof EventTarget;
}

// CustomEvent polyfill — needed by youtubei.js EventEmitterLike.emit()
if (typeof g.CustomEvent === 'undefined') {
  class CustomEventPolyfill {
    type: string;
    detail: unknown;
    constructor(type: string, options?: { detail?: unknown }) {
      this.type = type;
      this.detail = options?.detail;
    }
  }
  g.CustomEvent = CustomEventPolyfill as unknown as typeof CustomEvent;
}

// Mock mmkvStorage — youtubei.js react-native shim expects globalThis.mmkvStorage
// We removed react-native-mmkv, so provide in-memory cache
if (typeof g.mmkvStorage === 'undefined') {
  class MockMMKV implements MMKVStorageLike {
    private _data = new Map<string, ArrayBuffer>();

    constructor(_opts?: MMKVStorageOptions) {}

    getBuffer(key: string): MMKVBuffer | undefined {
      const val = this._data.get(key);
      return val ? { buffer: val } : undefined;
    }

    set(key: string, value: ArrayBuffer | SharedArrayBuffer | Uint8Array): void {
      const buffer = toArrayBuffer(value);

      this._data.set(key, buffer);
    }

    delete(key: string): void {
      this._data.delete(key);
    }
  }

  g.mmkvStorage = MockMMKV;
}

function toArrayBuffer(value: ArrayBuffer | SharedArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof Uint8Array) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  }

  return new Uint8Array(value).slice().buffer;
}
