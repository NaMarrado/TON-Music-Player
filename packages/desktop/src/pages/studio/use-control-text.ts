import { useTranslation } from 'react-i18next';

/**
 * The name and the plain-language explanation of a control. Both come from the locale files under `controls.<id>`, so
 * hovering any control shows the same two lines in every language.
 */
export function useControlText(control: string): { name: string; text: string } {
  const { t } = useTranslation('pages/studio');
  return { name: t(`controls.${control}.name`), text: t(`controls.${control}.text`) };
}
