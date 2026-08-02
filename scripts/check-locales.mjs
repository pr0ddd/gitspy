import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../src/locales', import.meta.url).pathname;
const REFERENCE = 'en';
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const locales = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const load = (locale) => {
  const catalogue = new Map();
  for (const file of readdirSync(join(ROOT, locale))) {
    if (!file.endsWith('.json')) continue;
    const namespace = file.replace(/\.json$/, '');
    const raw = JSON.parse(readFileSync(join(ROOT, locale, file), 'utf8'));
    for (const key of Object.keys(raw)) {
      const suffix = key.match(PLURAL_SUFFIX);
      const base = suffix ? key.slice(0, -suffix[0].length) : key;
      const id = `${namespace}:${base}`;
      const entry = catalogue.get(id) ?? { plural: false, categories: new Set() };
      if (suffix) {
        entry.plural = true;
        entry.categories.add(suffix[1]);
      }
      catalogue.set(id, entry);
    }
  }
  return catalogue;
};

const catalogues = new Map(locales.map((locale) => [locale, load(locale)]));
const reference = catalogues.get(REFERENCE);
if (!reference) {
  console.error(`опорный каталог ${REFERENCE} не найден`);
  process.exit(1);
}

const problems = [];

for (const [locale, catalogue] of catalogues) {
  for (const id of reference.keys()) {
    if (!catalogue.has(id)) problems.push(`${locale}: нет ключа ${id}`);
  }
  for (const id of catalogue.keys()) {
    if (!reference.has(id)) problems.push(`${locale}: лишний ключ ${id}, его нет в ${REFERENCE}`);
  }

  const required = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  for (const [id, entry] of catalogue) {
    if (!entry.plural) continue;
    for (const category of required) {
      if (!entry.categories.has(category)) {
        problems.push(`${locale}: у ${id} нет формы _${category}`);
      }
    }
  }
}

if (problems.length) {
  for (const problem of problems) console.error(problem);
  console.error(`\nнеполные переводы: ${problems.length}`);
  process.exit(1);
}

console.log(`переводы полны: ${locales.join(', ')} — ${reference.size} ключей`);
