import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import en from '../src/locales/en';
import fr from '../src/locales/fr';
import nl from '../src/locales/nl';
import ln from '../src/locales/ln';

const languages = { en, fr, nl, ln };
const srcDir = path.resolve(__dirname, '../src');

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'locales' ? [] : walk(full);
    return /\.(jsx?|mjs)$/.test(e.name) ? [full] : [];
  });

const placeholders = (text) => (String(text).match(/\{\{\s*\w+\s*\}\}/g) || []).sort().join(',');

describe('translations', () => {
  it('has the same keys in every language', () => {
    const reference = Object.keys(en).sort();
    for (const [code, texts] of Object.entries(languages)) {
      expect(Object.keys(texts).sort(), code).toEqual(reference);
    }
  });

  it('has no empty texts', () => {
    for (const [code, texts] of Object.entries(languages)) {
      const empty = Object.entries(texts).filter(([, v]) => !String(v).trim()).map(([k]) => k);
      expect(empty, code).toEqual([]);
    }
  });

  it('keeps the {{placeholders}} of the English text in every language', () => {
    for (const [code, texts] of Object.entries(languages)) {
      for (const key of Object.keys(en)) {
        expect(placeholders(texts[key]), `${code}.${key}`).toBe(placeholders(en[key]));
      }
    }
  });

  it('has every key that the code asks for', () => {
    const missing = [];
    for (const file of walk(srcDir)) {
      const code = fs.readFileSync(file, 'utf8');
      for (const m of code.matchAll(/\bt\(\s*'([A-Za-z0-9_.]+)'/g)) {
        if (!(m[1] in en)) missing.push(`${path.relative(srcDir, file)}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
