import { describe, it, expect } from 'vitest';
import { birthdayBadge, badgeLabels } from '../../src/utils/birthdays';

const today = '2026-11-05';
const born = (date, extra = {}) => ({ birthDate: date, ...extra });

describe('birthday badge', () => {
  it('shows a party face on the day itself, without a countdown', () => {
    const badge = birthdayBadge(born('1990-11-05'), today);
    expect(badge.emoji).toBe('🥳');
    expect(badge.days).toBe(0);
  });

  it('shows the cake with the days left, from 7 down to 1', () => {
    for (let days = 1; days <= 7; days++) {
      const date = `1990-11-${String(5 + days).padStart(2, '0')}`;
      const badge = birthdayBadge(born(date), today);
      expect(badge.emoji).toBe('🎂');
      expect(badge.days).toBe(days);
    }
  });

  it('shows nothing for 8 days or more, the deceased, approximate dates or no date', () => {
    expect(birthdayBadge(born('1990-11-13'), today)).toBeNull();
    expect(birthdayBadge(born('1990-11-07', { deathDate: '2000-01-01' }), today)).toBeNull();
    expect(birthdayBadge(born('1990-11-07', { deceased: true }), today)).toBeNull();
    expect(birthdayBadge(born('1990-11-07', { birthApprox: true }), today)).toBeNull();
    expect(birthdayBadge({}, today)).toBeNull();
  });

  it('puts the date and the age in the tooltip, in the words it is given', () => {
    const t = (key, vars) => ({ birthdayInDays: `Dans ${vars && vars.n} jours`, birthdayTomorrow: 'Demain', birthdayToday: 'Aujourd’hui' }[key]);
    expect(birthdayBadge(born('1990-11-08'), today, badgeLabels(t)).title).toBe('Dans 3 jours · 08/11 · 36');
    expect(birthdayBadge(born('1990-11-06'), today, badgeLabels(t)).title).toBe('Demain · 06/11 · 36');
    expect(birthdayBadge(born('1990-11-05'), today, badgeLabels(t)).title).toBe('Aujourd’hui · 36');
  });
});
