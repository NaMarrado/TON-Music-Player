import { Dialog } from '../../../components/ui/dialog';
import type { SpotifyTranslator } from './use-spotify-credentials';

interface SpotifyHelpDialogProps {
  onClose: () => void;
  t: SpotifyTranslator;
}

export function SpotifyHelpDialog({ onClose, t }: SpotifyHelpDialogProps) {
  const steps = [
    t('spotifyStep1'),
    t('spotifyStep2'),
    t('spotifyStep3'),
    t('spotifyStep4'),
    t('spotifyStep5'),
    t('spotifyStep6'),
    t('spotifyStep7'),
  ];

  return (
    <Dialog open onClose={onClose} title={t('spotifyHelpTitle')}>
      <div style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: '8px' }}>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.82rem',
            lineHeight: '1.6',
            marginBottom: '20px',
          }}
        >
          {t('spotifyHelpIntro')}
        </p>
        <ol style={{ margin: 0, paddingLeft: '20px' }}>
          {steps.map((step, index) => (
            <li
              key={index}
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.82rem',
                lineHeight: '1.6',
                marginBottom: '12px',
              }}
            >
              <span style={{ color: 'var(--white)', fontWeight: 500 }}>
                {step.split('–')[0]}
              </span>
              {step.includes('–') ? `–${step.split('–').slice(1).join('–')}` : ''}
            </li>
          ))}
        </ol>
        <div
          style={{
            marginTop: '16px',
            padding: '12px 16px',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-deep)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '0.75rem',
              lineHeight: '1.5',
              margin: 0,
            }}
          >
            {t('spotifyHelpNote')}
          </p>
        </div>
      </div>
      <div className="flex justify-end" style={{ marginTop: '20px' }}>
        <button
          className="play-all-btn cursor-pointer"
          onClick={onClose}
          style={{
            padding: '8px 24px',
            borderRadius: '16px',
            background: 'var(--white)',
            color: 'var(--bg-deep)',
            border: 'none',
            fontSize: '0.78rem',
            fontWeight: 500,
            fontFamily: 'inherit',
            transition: 'all var(--transition)',
          }}
        >
          OK
        </button>
      </div>
    </Dialog>
  );
}
