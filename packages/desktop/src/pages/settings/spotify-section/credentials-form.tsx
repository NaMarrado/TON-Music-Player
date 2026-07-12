import type { SpotifyTranslator } from './use-spotify-credentials';
import type { SettingsLayout } from '../use-settings-layout';

interface CredentialsFormProps {
  id: string;
  layout: SettingsLayout;
  saved: boolean;
  secret: string;
  setId: (value: string) => void;
  setSecret: (value: string) => void;
  onSave: () => void;
  t: SpotifyTranslator;
}

function CredentialsField({
  label,
  onChange,
  placeholder,
  type,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  type: 'password' | 'text';
  value: string;
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: '0.72rem',
          color: 'var(--text-secondary)',
          marginBottom: '4px',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </label>
      <input
        type={type}
        className="w-full outline-none"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          background: 'var(--bg-deep)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '9px 12px',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
          fontSize: '0.82rem',
          transition: 'all var(--transition)',
        }}
      />
    </div>
  );
}

export function CredentialsForm({
  id,
  layout,
  onSave,
  saved,
  secret,
  setId,
  setSecret,
  t,
}: CredentialsFormProps) {
  return (
    <div className="flex flex-col gap-3" style={{ paddingLeft: layout.sectionIndent }}>
      <CredentialsField
        label={t('spotifyId')}
        onChange={setId}
        placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        type="text"
        value={id}
      />
      <CredentialsField
        label={t('spotifySecret')}
        onChange={setSecret}
        placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        type="password"
        value={secret}
      />
      <div>
        <button
          className="play-all-btn cursor-pointer"
          onClick={onSave}
          style={{
            padding: '7px 20px',
            borderRadius: '16px',
            background: saved ? 'var(--bg-hover)' : 'var(--white)',
            color: saved ? 'var(--white)' : 'var(--bg-deep)',
            border: 'none',
            fontSize: '0.78rem',
            fontWeight: 500,
            fontFamily: 'inherit',
            transition: 'all var(--transition)',
            width: layout.compact ? '100%' : undefined,
            minHeight: layout.compact ? '42px' : undefined,
          }}
        >
          {saved ? t('spotifySaved') : t('spotifySave')}
        </button>
      </div>
    </div>
  );
}
