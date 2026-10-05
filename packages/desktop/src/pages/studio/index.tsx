import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as core from '@ton/core';
import { HintLayer } from '../../components/ui/hint-layer';
import * as library from '../../stores/library-store';
import { ClearDialog, ExportDialog } from './studio-dialogs';
import { studioEngine } from './studio-engine';
import { WaveIcon } from './studio-icons';
import { StudioBar } from './studio-bar';
import { StudioSide, type SideTab } from './studio-side';
import type { SongSource } from './studio-songs';
import * as ops from './studio-store';
import { StudioTimeline } from './studio-timeline';
import './studio.css';

const { useStudioStore } = ops;

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && target.getAttribute('type') !== 'range');
}

export function StudioPage() {
  const { t } = useTranslation('pages/studio');
  const empty = useStudioStore((state) => state.project.tracks.length === 0);
  const editRequest = useStudioStore((state) => state.editRequest);
  const [tab, setTab] = useState<SideTab>('songs');
  const [source, setSource] = useState<SongSource>('library');
  const [exportOpen, setExportOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  // Picking a clip means the user wants to edit it. (Adding a song also selects a clip, but does not count as picking.)
  useEffect(() => { if (editRequest > 0) setTab('edit'); }, [editRequest]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.altKey) return;
      const key = event.key.toLowerCase();
      const state = ops.useStudioStore.getState();
      if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); if (event.shiftKey) ops.redo(); else ops.undo(); }
      else if ((event.ctrlKey || event.metaKey) && key === 'y') { event.preventDefault(); ops.redo(); }
      else if (event.ctrlKey || event.metaKey) return;
      else if (key === ' ') { event.preventDefault(); ops.togglePlay(); }
      else if (key === 'delete' || key === 'backspace') { event.preventDefault(); ops.deleteSelectedClip(); }
      else if (key === 's') { event.preventDefault(); ops.splitAtPlayhead(); }
      else if (key === '=' || key === '+') { event.preventDefault(); ops.setZoom(state.pxPerSec * 1.35); }
      else if (key === '-' || key === '_') { event.preventDefault(); ops.setZoom(state.pxPerSec / 1.35); }
      else if (key === '0') { event.preventDefault(); ops.fitToWindow(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      ops.pausePlayback();
    };
  }, []);

  // Development only: lets the automated checks reach the live store and engine without guessing module URLs.
  useEffect(() => {
    if (import.meta.env.DEV) Reflect.set(window, '__studio', { store: ops.useStudioStore, ops, engine: studioEngine, core, library });
  }, []);

  return (
    <div className="studio-page">
      <HintLayer scope=".studio-page" />
      <StudioBar onExport={() => setExportOpen(true)} onClear={() => setClearOpen(true)} />
      <div className="studio-main">
        {empty ? (
          <div className="studio-timeline studio-empty">
            <WaveIcon />
            <p>{t('emptyText')}</p>
          </div>
        ) : (
          <StudioTimeline />
        )}
        <StudioSide tab={tab} onTab={setTab} source={source} onSource={setSource} />
      </div>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <ClearDialog open={clearOpen} onClose={() => setClearOpen(false)} />
    </div>
  );
}
