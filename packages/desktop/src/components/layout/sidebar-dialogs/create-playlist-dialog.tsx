import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../ui/dialog';
import { Input } from '../../ui/input';

export function CreatePlaylistDialog({
  onCancel,
  onCreate,
  t,
}: {
  t: (key: string) => string;
  onCreate: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const canCreate = name.trim().length > 0;

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (trimmed) {
      onCreate(trimmed);
    }
  };

  return (
    <Dialog open onClose={onCancel} title={t('createTitle')}>
      <Input
        ref={inputRef}
        placeholder={t('playlistName')}
        value={name}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
        onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') handleSubmit();
          if (event.key === 'Escape') onCancel();
        }}
        style={{ background: 'var(--bg-elevated)' }}
      />
      <div className="flex justify-end gap-3" style={{ marginTop: '28px' }}>
        <button
          className="download-btn cursor-pointer"
          onClick={onCancel}
          style={{
            padding: '10px 20px',
            borderRadius: '20px',
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            fontSize: '0.82rem',
            fontFamily: 'inherit',
            fontWeight: 500,
            transition: 'all var(--transition)',
          }}
        >
          {t('cancel')}
        </button>
        <button
          className={`cursor-pointer ${canCreate ? 'play-all-btn' : ''}`}
          onClick={handleSubmit}
          disabled={!canCreate}
          style={{
            padding: '10px 20px',
            borderRadius: '20px',
            background: canCreate ? 'var(--white)' : 'var(--bg-elevated)',
            color: canCreate ? 'var(--bg-deep)' : 'var(--text-secondary)',
            border: canCreate ? 'none' : '1px solid var(--border)',
            fontSize: '0.82rem',
            fontWeight: canCreate ? 600 : 500,
            fontFamily: 'inherit',
            transition: 'all var(--transition)',
          }}
        >
          {t('create')}
        </button>
      </div>
    </Dialog>
  );
}
