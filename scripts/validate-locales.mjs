import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const localeRoots = [
  'packages/core/src/i18n/locales',
  'packages/desktop/src/locales',
  'packages/mobile/src/locales',
];

const errors = [];

for (const localeRoot of localeRoots) {
  const languages = (await readdir(localeRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const referenceRoot = path.join(localeRoot, 'en');
  const referenceFiles = await listJsonFiles(referenceRoot);

  for (const language of languages) {
    if (language === 'en') {
      continue;
    }

    const languageRoot = path.join(localeRoot, language);
    const languageFiles = await listJsonFiles(languageRoot);
    compareLists(localeRoot, language, referenceFiles, languageFiles);

    for (const relativeFile of referenceFiles) {
      if (!languageFiles.includes(relativeFile)) {
        continue;
      }

      const reference = await readJson(path.join(referenceRoot, relativeFile));
      const translation = await readJson(path.join(languageRoot, relativeFile));
      compareEntries(localeRoot, language, relativeFile, reference, translation);
    }
  }
}

if (errors.length > 0) {
  console.error(`Locale validation failed with ${errors.length} error(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Locale validation passed.');

async function listJsonFiles(root) {
  const files = [];

  async function walk(current, relativeRoot = '') {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = path.join(relativeRoot, entry.name);
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(relativePath);
      }
    }
  }

  await walk(root);
  return files.sort();
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function compareLists(root, language, referenceFiles, languageFiles) {
  for (const file of referenceFiles) {
    if (!languageFiles.includes(file)) {
      errors.push(`${root}/${language} is missing ${file}`);
    }
  }

  for (const file of languageFiles) {
    if (!referenceFiles.includes(file)) {
      errors.push(`${root}/${language} has unexpected ${file}`);
    }
  }
}

function compareEntries(root, language, file, reference, translation) {
  const referenceKeys = Object.keys(reference).sort();
  const translationKeys = Object.keys(translation).sort();

  for (const key of referenceKeys) {
    if (!(key in translation)) {
      errors.push(`${root}/${language}/${file} is missing key ${key}`);
      continue;
    }

    const expectedPlaceholders = placeholders(reference[key]);
    const actualPlaceholders = placeholders(translation[key]);
    if (expectedPlaceholders.join('|') !== actualPlaceholders.join('|')) {
      errors.push(
        `${root}/${language}/${file}:${key} placeholders differ `
        + `(${expectedPlaceholders.join(', ')} vs ${actualPlaceholders.join(', ')})`,
      );
    }
  }

  for (const key of translationKeys) {
    if (!(key in reference)) {
      errors.push(`${root}/${language}/${file} has unexpected key ${key}`);
    }
  }
}

function placeholders(value) {
  if (typeof value !== 'string') {
    return [];
  }

  return [...value.matchAll(/{{\s*([^},\s]+)[^}]*}}/g)]
    .map((match) => match[1])
    .sort();
}
