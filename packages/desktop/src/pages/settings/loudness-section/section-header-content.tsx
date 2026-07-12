import { SectionHeader, ToggleSwitch } from '../helpers';

function LoudnessIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

export function LoudnessSectionHeader({
  compact,
  enabled,
  onToggle,
  t,
}: {
  compact: boolean;
  enabled: boolean;
  onToggle: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <SectionHeader
      compact={compact}
      icon={<LoudnessIcon />}
      title={t('loudnessSection')}
      description={t('loudnessDescription')}
      right={<ToggleSwitch enabled={enabled} onClick={onToggle} />}
    />
  );
}
