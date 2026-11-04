import { describe, it, expect } from 'vitest';
import { isDeceased, yearText, lifespanText, dateText } from '../../src/utils/lifespan';

describe('dates that may be unknown or approximate', () => {
  it('writes approximate years with "c." and unknown ones with "?"', () => {
    expect(yearText('1930-01-01', false)).toBe('1930');
    expect(yearText('1930-01-01', true)).toBe('c. 1930');
    expect(yearText(null)).toBe('?');
  });

  it('writes the life span of living, deceased and half-known people', () => {
    expect(lifespanText({ birthDate: '1950-05-05' })).toBe('1950');
    expect(lifespanText({ birthDate: '1950-05-05' }, (b) => `b. ${b}`)).toBe('b. 1950');
    expect(lifespanText({ birthDate: '1900-02-02', deathDate: '1980-03-03' })).toBe('1900 - 1980');
    expect(lifespanText({ birthDate: '1900-01-01', birthApprox: true, deceased: true })).toBe('c. 1900 - ?');
    expect(lifespanText({ deceased: true })).toBe('? - ?');
    expect(lifespanText({ birthDate: '1900-01-01', deathDate: '1960-01-01', deathApprox: true })).toBe('1900 - c. 1960');
  });

  it('knows who is deceased, with or without a death date', () => {
    expect(isDeceased({ deathDate: '1980-01-01' })).toBe(true);
    expect(isDeceased({ deceased: true })).toBe(true);
    expect(isDeceased({ birthDate: '1980-01-01' })).toBe(false);
  });

  it('shows full dates as dd/mm/yyyy, or just the year when approximate', () => {
    expect(dateText('1930-03-04')).toBe('04/03/1930');
    expect(dateText('1930-01-01', true)).toBe('c. 1930');
    expect(dateText(null)).toBe('-');
    expect(dateText(null, false, '')).toBe('');
  });
});
