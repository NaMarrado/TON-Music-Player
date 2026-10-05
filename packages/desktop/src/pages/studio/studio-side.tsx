import { StudioButton } from './studio-controls';
import { StudioEdit } from './studio-edit';
import { SlidersIcon, LibraryIcon } from './studio-icons';
import { StudioSongs, type SongSource } from './studio-songs';

export type SideTab = 'songs' | 'edit';

interface Props {
  tab: SideTab;
  onTab: (tab: SideTab) => void;
  source: SongSource;
  onSource: (source: SongSource) => void;
}

/** One panel of a fixed size. Switching tabs swaps its contents; the panel itself never changes size. */
export function StudioSide({ tab, onTab, source, onSource }: Props) {
  return (
    <aside className="studio-side">
      <div className="studio-tabs" role="tablist">
        <StudioButton control="tab-songs" onClick={() => onTab('songs')} active={tab === 'songs'} label><LibraryIcon /></StudioButton>
        <StudioButton control="tab-edit" onClick={() => onTab('edit')} active={tab === 'edit'} label><SlidersIcon /></StudioButton>
      </div>
      <div className="studio-side-body">
        {tab === 'songs' ? <StudioSongs source={source} onSource={onSource} /> : <StudioEdit />}
      </div>
    </aside>
  );
}
