import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export interface ProfileFormat {
  number: (value: number) => string;
  decimal: (value: number) => string;
  date: (value: number) => string;
  dateTime: (value: number) => string;
  day: (value: string, short?: boolean) => string;
  hour: (value: number) => string;
  weekday: (value: number) => string;
  duration: (milliseconds: number) => string;
  exactDuration: (milliseconds: number) => string;
  volume: (value: number | null) => string;
  rate: (value: number) => string;
}

export function useProfileFormat(): ProfileFormat {
  const { t, i18n } = useTranslation('pages/profile');
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return useMemo(() => {
    const number = new Intl.NumberFormat(locale);
    const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const seconds = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
    const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' });
    const shortDate = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
    const hour = new Intl.DateTimeFormat(locale, { hour: 'numeric' });
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    return {
      number: (value: number) => number.format(value),
      decimal: (value: number) => decimal.format(value),
      date: (value: number) => date.format(value),
      dateTime: (value: number) => dateTime.format(value),
      day: (value: string, short = false) => {
        const [year, month, day] = value.split('-').map(Number);
        const timestamp = new Date(year, month - 1, day);
        return (short ? shortDate : date).format(timestamp);
      },
      hour: (value: number) => hour.format(new Date(2024, 0, 7, value)),
      weekday: (value: number) => weekday.format(new Date(2024, 0, 7 + value)),
      duration: (ms: number) => {
        if (ms >= 3_600_000) return t('durationHours', { value: decimal.format(ms / 3_600_000) });
        if (ms >= 60_000) return t('durationMinutes', { value: decimal.format(ms / 60_000) });
        if (ms > 0 && ms < 1_000) return t('durationMilliseconds', { value: number.format(ms) });
        return t('durationSeconds', { value: decimal.format(ms / 1_000) });
      },
      exactDuration: (ms: number) => {
        const hours = Math.floor(ms / 3_600_000);
        const minutes = Math.floor(ms / 60_000) % 60;
        const wholeSeconds = ms >= 60_000 ? Math.floor((ms % 60_000) / 1_000) : (ms % 60_000) / 1_000;
        return [
          ...(hours ? [t('durationHours', { value: number.format(hours) })] : []),
          ...(hours || minutes ? [t('durationMinutes', { value: number.format(minutes) })] : []),
          t('durationSeconds', { value: seconds.format(wholeSeconds) }),
        ].join(' ');
      },
      volume: (value: number | null) => value === null ? t('unknownValue') : t('volumeLevel', { value: decimal.format(value) }),
      rate: (value: number) => t('rateValue', { value: seconds.format(value) }),
    };
  }, [locale, t]);
}
