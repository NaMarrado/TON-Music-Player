import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export interface ProfileFormat {
  number: (value: number) => string;
  decimal: (value: number) => string;
  dateTime: (value: number) => string;
  day: (value: string, short?: boolean) => string;
  hour: (value: number) => string;
  weekday: (value: number) => string;
  duration: (milliseconds: number) => string;
  exactDuration: (milliseconds: number) => string;
  volume: (value: number | null) => string;
  rate: (value: number) => string;
}

/** Same wording and rounding as the desktop Profile page. */
export function useProfileFormat(): ProfileFormat {
  const { t, i18n } = useTranslation('profile');
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return useMemo(() => {
    const number = new Intl.NumberFormat(locale);
    const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const seconds = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
    const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
    const shortDate = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
    const hour = new Intl.DateTimeFormat(locale, { hour: 'numeric' });
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    return {
      number: (value) => number.format(value),
      decimal: (value) => decimal.format(value),
      dateTime: (value) => dateTime.format(value),
      day: (value, short = false) => {
        const [year, month, day] = value.split('-').map(Number);
        return (short ? shortDate : date).format(new Date(year, month - 1, day));
      },
      hour: (value) => hour.format(new Date(2024, 0, 7, value)),
      weekday: (value) => weekday.format(new Date(2024, 0, 7 + value)),
      duration: (ms) => {
        if (ms >= 3_600_000) return t('durationHours', { value: decimal.format(ms / 3_600_000) });
        if (ms >= 60_000) return t('durationMinutes', { value: decimal.format(ms / 60_000) });
        if (ms > 0 && ms < 1_000) return t('durationMilliseconds', { value: number.format(ms) });
        return t('durationSeconds', { value: decimal.format(ms / 1_000) });
      },
      exactDuration: (ms) => {
        const hours = Math.floor(ms / 3_600_000);
        const minutes = Math.floor(ms / 60_000) % 60;
        const wholeSeconds = ms >= 60_000 ? Math.floor((ms % 60_000) / 1_000) : (ms % 60_000) / 1_000;
        return [
          ...(hours ? [t('durationHours', { value: number.format(hours) })] : []),
          ...(hours || minutes ? [t('durationMinutes', { value: number.format(minutes) })] : []),
          t('durationSeconds', { value: seconds.format(wholeSeconds) }),
        ].join(' ');
      },
      volume: (value) => value === null ? t('unknownValue') : t('volumeLevel', { value: decimal.format(value) }),
      rate: (value) => t('rateValue', { value: seconds.format(value) }),
    };
  }, [locale, t]);
}
