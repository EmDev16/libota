import { describe, it, expect } from 'vitest';
import { formatDate, formatDayMonth, localToday } from '../../src/utils/dates';

describe('dates', () => {
  it('shows dd/mm/yyyy', () => {
    expect(formatDate('2004-03-07T00:00:00.000Z')).toBe('07/03/2004');
    expect(formatDate('1999-12-31')).toBe('31/12/1999');
  });

  it('shows the fallback for a missing or broken date', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined, '-')).toBe('-');
    expect(formatDate('nonsense', '-')).toBe('-');
  });

  it('shows dd/mm', () => {
    expect(formatDayMonth(5, 11)).toBe('05/11');
  });

  it('gives the local day as yyyy-mm-dd', () => {
    expect(localToday(new Date(2026, 9, 2, 23, 59))).toBe('2026-10-02');
  });
});
