import { useEffect, useRef, useState } from 'react';
import { CUSTOM_PROTOCOL } from '@ton/core';
import { updatePlaylist } from '../../../stores/playlist-store';
import { showToast } from '../../../stores/toast-store';
import type { EditPlaylistDialogProps } from './types';

const ipc = window.api.invoke as (...args: unknown[]) => Promise<unknown>;

type UseEditPlaylistFormArgs = Pick<EditPlaylistDialogProps, 'onClose' | 'playlist' | 't'>;

export function useEditPlaylistForm({ onClose, playlist, t }: UseEditPlaylistFormArgs) {
  const [name, setName] = useState(playlist.name);
  const [coverPath, setCoverPath] = useState(playlist.cover_path || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const coverUrl = coverPath
    ? `${CUSTOM_PROTOCOL}://${encodeURIComponent(coverPath)}`
    : null;

  async function handlePickCover() {
    const path = (await ipc('playlist:pick-cover')) as string | null;
    if (path) {
      setCoverPath(path);
    }
  }

  async function handleSave() {
    const updates: Record<string, string> = {};
    if (name.trim() && name.trim() !== playlist.name) {
      updates.name = name.trim();
    }
    if (coverPath !== (playlist.cover_path || '')) {
      updates.cover_path = coverPath;
    }
    if (Object.keys(updates).length > 0) {
      await updatePlaylist(playlist.id, updates);
      showToast(t('toastSaved'), 'success');
    }
    onClose();
  }

  return {
    coverPath,
    coverUrl,
    handlePickCover,
    handleSave,
    inputRef,
    name,
    setName,
  };
}
