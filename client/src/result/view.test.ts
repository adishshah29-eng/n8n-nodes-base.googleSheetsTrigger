import { describe, expect, it } from 'vitest';
import { fill, strings, t } from '../i18n';
import { resultKind, TEXT } from './view';

describe('resultKind', () => {
  it('maps outcomes', () => {
    expect(resultKind({ passed: true, criticalFail: false })).toBe('passed');
    expect(resultKind({ passed: false, criticalFail: false })).toBe('failed');
    expect(resultKind({ passed: false, criticalFail: true })).toBe('critical');
  });

  it('treats a critical fail as critical even if flagged passed', () => {
    expect(resultKind({ passed: true, criticalFail: true })).toBe('critical');
  });
});

describe('i18n', () => {
  it('has the same keys in English and Hindi, none empty', () => {
    expect(Object.keys(strings.hi).sort()).toEqual(Object.keys(strings.en).sort());
    for (const lang of ['en', 'hi'] as const)
      for (const v of Object.values(strings[lang])) expect(v.trim()).not.toBe('');
  });

  it('fills placeholders', () => {
    expect(fill('{n} waiting', { n: 3 })).toBe('3 waiting');
  });

  it('has text for every result kind in every language', () => {
    for (const lang of ['en', 'hi', 'sat'] as const)
      for (const k of Object.values(TEXT)) {
        expect(t(lang, k.title)).toBeTruthy();
        expect(t(lang, k.message)).toBeTruthy();
      }
  });

  it('falls back to Hindi for Santali until native text exists', () => {
    expect(t('sat', 'tryAgain')).toBe(t('hi', 'tryAgain'));
    expect(t('en', 'tryAgain')).not.toBe(t('hi', 'tryAgain'));
  });
});
