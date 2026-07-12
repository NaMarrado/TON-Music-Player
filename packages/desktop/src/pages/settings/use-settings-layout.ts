import { useDesktopContentWidth } from '../../hooks/use-desktop-content-width';

export interface SettingsLayout {
  cardPadding: number;
  compact: boolean;
  contentPaddingX: number;
  maxContentWidth: number;
  sectionIndent: number;
}

export function useSettingsLayout(): SettingsLayout {
  const { contentWidth } = useDesktopContentWidth();
  const compact = contentWidth < 860;
  const medium = contentWidth < 1020;

  return {
    compact,
    contentPaddingX: compact ? 12 : medium ? 24 : 32,
    cardPadding: compact ? 14 : 24,
    maxContentWidth: compact ? 880 : 980,
    sectionIndent: compact ? 0 : 36,
  };
}
