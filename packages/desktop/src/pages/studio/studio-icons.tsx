import type { ReactNode } from 'react';

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const ConnectIcon = () => <Icon><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" /></Icon>;
export const PlayIcon = () => <Icon><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></Icon>;
export const PauseIcon = () => <Icon><path d="M8 5v14M16 5v14" strokeWidth="3" /></Icon>;
export const StopIcon = () => <Icon><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" /></Icon>;
export const SplitIcon = () => <Icon><path d="M12 3v18" strokeDasharray="2 3" /><path d="M4 8h5M15 16h5" /></Icon>;
export const DuplicateIcon = () => <Icon><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Icon>;
export const TrashIcon = () => <Icon><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></Icon>;
export const UndoIcon = () => <Icon><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></Icon>;
export const RedoIcon = () => <Icon><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></Icon>;
export const MagnetIcon = () => <Icon><path d="M6 15V5h4v10a2 2 0 0 0 4 0V5h4v10a6 6 0 0 1-12 0Z" /><path d="M6 9h4M14 9h4" /></Icon>;
export const ZoomInIcon = () => <Icon><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M11 8v6M8 11h6" /></Icon>;
export const ZoomOutIcon = () => <Icon><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8 11h6" /></Icon>;
export const CrossfadeIcon = () => <Icon><path d="M3 18 12 6l9 12" /><path d="M3 6l9 12 9-12" opacity="0.55" /></Icon>;
export const TempoIcon = () => <Icon><path d="M12 3 5 21h14L12 3Z" /><path d="M12 9v7M12 16l4-4" /></Icon>;
export const ExportIcon = () => <Icon><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></Icon>;
export const CloseIcon = () => <Icon><path d="M6 6l12 12M18 6 6 18" /></Icon>;
export const MuteIcon = () => <Icon><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="m16 9 5 6M21 9l-5 6" /></Icon>;
export const VolumeIcon = () => <Icon><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></Icon>;
export const SoloIcon = () => <Icon><circle cx="12" cy="12" r="8" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.7-1.5-1.5 0-2.6.8-2.6 2 0 3 5.6 1.8 5.6 4.7 0 1.3-1.200 2.300-2.900 2.300-1.300 0-2.400-.6-3-1.800" /></Icon>;
export const SlidersIcon = () => <Icon><path d="M6 4v16M12 4v16M18 4v16" /><rect x="3.5" y="13" width="5" height="3.5" rx="1" fill="currentColor" /><rect x="9.5" y="6" width="5" height="3.5" rx="1" fill="currentColor" /><rect x="15.5" y="10" width="5" height="3.5" rx="1" fill="currentColor" /></Icon>;
export const LockIcon = () => <Icon><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Icon>;
export const ReverseIcon = () => <Icon><path d="M20 12H5M10 6l-6 6 6 6" /></Icon>;
export const LibraryIcon = () => <Icon><path d="M4 4v16M9 4v16M14 6l5 14" /></Icon>;
export const PlaylistIcon = () => <Icon><path d="M4 6h12M4 12h12M4 18h7" /><circle cx="18" cy="17" r="2.5" /><path d="M20.500 17V8" /></Icon>;
export const SearchIcon = () => <Icon><circle cx="11" cy="11" r="7" /><path d="m20 20-3.500-3.500" /></Icon>;
export const WaveIcon = () => <Icon size={28}><path d="M3 12h2M7 7v10M11 4v16M15 8v8M19 10v4M21 12h0" /></Icon>;
export const CurveLinearIcon = () => <Icon><path d="M4 19 20 5" /></Icon>;
export const CurveSmoothIcon = () => <Icon><path d="M4 19c6 0 4-14 16-14" /></Icon>;
export const CurveSlowIcon = () => <Icon><path d="M4 19c9 0 12-2 16-14" /></Icon>;
export const ResetIcon = () => <Icon><path d="M4 12a8 8 0 1 0 3-6.200" /><path d="M4 4v5h5" /></Icon>;
export const SlowedIcon = () => <Icon><path d="M4 12h4M10 8l-4 4 4 4M20 12h-4" /><circle cx="16" cy="12" r="0.8" fill="currentColor" /></Icon>;
export const SpedUpIcon = () => <Icon><path d="m6 6 6 6-6 6M13 6l6 6-6 6" /></Icon>;
export const BassIcon = () => <Icon><circle cx="12" cy="14" r="6" /><circle cx="12" cy="14" r="2" /><path d="M12 3v3" /></Icon>;
export const ReverbIcon = () => <Icon><path d="M12 8v8M8 6v12M4 10v4M16 6v12M20 10v4" opacity="0.9" /></Icon>;
export const MuffleIcon = () => <Icon><path d="M3 12h4l2-6 3 12 2-6h7" opacity="0.9" /><path d="M16 5v14" strokeDasharray="1 3" /></Icon>;
export const PitchIcon = () => <Icon><path d="M9 18V6l10-2v12" /><circle cx="6.500" cy="18" r="2.500" /><circle cx="16.500" cy="16" r="2.500" /></Icon>;
export const TrebleIcon = () => <Icon><path d="M12 3v18M7 7v10M17 8v8M3 11v2M21 11v2" /></Icon>;
export const PanIcon = () => <Icon><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" /></Icon>;
export const EchoIcon = () => <Icon><circle cx="7" cy="12" r="2" fill="currentColor" /><path d="M12 7a7 7 0 0 1 0 10M16 4a11 11 0 0 1 0 16" /></Icon>;
export const FilterIcon = () => <Icon><path d="M3 6h18l-7 8v5l-4 2v-7L3 6Z" /></Icon>;
export const GainIcon = () => <Icon><path d="M3 14v-4M7 17V7M11 20V4M15 16V8M19 13v-2" /></Icon>;
export const FadeInIcon = () => <Icon><path d="M3 20 21 4v16H3Z" opacity="0.8" /></Icon>;
export const FitIcon = () => <Icon><path d="M4 12h16M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3" /><path d="M4 5v14M20 5v14" /></Icon>;
