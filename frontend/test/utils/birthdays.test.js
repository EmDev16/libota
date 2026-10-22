import { describe, it, expect } from 'vitest';
import { birthdayInfo, birthdayBadge } from '../../src/utils/birthdays';

const today = '2026-10-22';

describe('birthdayBadge', () => {
  it('shows the party face on the birthday itself', () => {
    expect(birthdayBadge({ birthDate: '2000-10-22' }, today).emoji).toBe('🥳');
  });

  it('shows a cake in the 7 days before, and nothing earlier', () => {
    expect(birthdayBadge({ birthDate: '1990-10-23' }, today).emoji).toBe('🎂');
    expect(birthdayBadge({ birthDate: '1990-10-29' }, today).emoji).toBe('🎂');
    expect(birthdayBadge({ birthDate: '1990-10-30' }, today)).toBeNull();
  });

  it('does not keep the emoji after the birthday', () => {
    expect(birthdayBadge({ birthDate: '1990-10-21' }, today)).toBeNull();
  });

  it('never shows it for deceased people or people without a birth date', () => {
    expect(birthdayBadge({ birthDate: '1950-10-22', deathDate: '2001-01-01' }, today)).toBeNull();
    expect(birthdayBadge({}, today)).toBeNull();
  });

  it('says the age that is reached and the date in the tooltip', () => {
    expect(birthdayBadge({ birthDate: '2000-10-22' }, today).title).toContain('26');
    const soon = birthdayBadge({ birthDate: '1990-10-25' }, today).title;
    expect(soon).toContain('25/10');
    expect(soon).toContain('36');
  });

  it('looks across the new year and handles 29 February', () => {
    expect(birthdayInfo({ birthDate: '1980-01-02' }, '2026-12-30').daysAway).toBe(3);
    expect(birthdayInfo({ birthDate: '2000-02-29' }, '2027-02-25').daysAway).toBe(3);
  });

  it('ignores people born in the future', () => {
    expect(birthdayBadge({ birthDate: '2030-10-22' }, today)).toBeNull();
  });
});
