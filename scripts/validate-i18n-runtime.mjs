import assert from 'node:assert/strict';
import i18next from 'i18next';
import {
  directionalTextPostProcessor,
  getLanguageDisplayName,
  isolateDirectionalText,
  prepareLocaleResources,
} from '../packages/core/dist/i18n/text-direction.js';

const RLI = '\u2067';
const PDI = '\u2069';

assert.equal(isolateDirectionalText('Settings', 'ltr'), 'Settings');
assert.equal(isolateDirectionalText('الإعدادات', 'rtl'), `${RLI}الإعدادات${PDI}`);
assert.equal(
  isolateDirectionalText(`${RLI}الإعدادات${PDI}`, 'rtl'),
  `${RLI}الإعدادات${PDI}`,
);
assert.equal(getLanguageDisplayName('ar'), `${RLI}العربية${PDI}`);
assert.equal(getLanguageDisplayName('he'), `${RLI}עברית${PDI}`);
assert.equal(getLanguageDisplayName('zh'), '简体中文');

const interpolationInstance = i18next.createInstance();
interpolationInstance.use(directionalTextPostProcessor);
await interpolationInstance.init({
  lng: 'ar',
  fallbackLng: 'en',
  postProcess: [directionalTextPostProcessor.name],
  resources: {
    ar: {
      translation: {
        downloading: 'جارٍ تنزيل {{title}} — {{progress}}%',
      },
    },
  },
});
assert.equal(
  interpolationInstance.t('downloading', { title: 'Make Me Fade', progress: 75 }),
  `${RLI}جارٍ تنزيل Make Me Fade — 75%${PDI}`,
);

const pluralFixtures = {
  ar: { one: 'AR local one {{count}}', other: 'AR local other {{count}}' },
  he: { one: 'HE local one {{count}}', other: 'HE local other {{count}}' },
  cs: { one: 'CS local one {{count}}', other: 'CS local other {{count}}' },
  pl: { one: 'PL local one {{count}}', other: 'PL local other {{count}}' },
  ru: { one: 'RU local one {{count}}', other: 'RU local other {{count}}' },
};

for (const [language, fixture] of Object.entries(pluralFixtures)) {
  const raw = {
    item_one: fixture.one,
    item_other: fixture.other,
  };
  const prepared = prepareLocaleResources(language, raw);
  assert.deepEqual(Object.keys(raw).sort(), ['item_one', 'item_other']);

  const instance = i18next.createInstance();
  await instance.init({
    lng: language,
    fallbackLng: 'en',
    resources: {
      [language]: { translation: prepared },
      en: {
        translation: {
          item_one: 'EN fallback one {{count}}',
          item_other: 'EN fallback other {{count}}',
        },
      },
    },
  });

  for (const count of [0, 1, 2, 3, 11, 100]) {
    const translated = instance.t('item', { count });
    assert.match(translated, new RegExp(`^${language.toUpperCase()} local`));
    assert.doesNotMatch(translated, /EN fallback/);
  }
}

console.log('i18n runtime validation passed.');
