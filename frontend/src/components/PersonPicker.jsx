import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { familyOptions, peopleOfFamily } from '../utils/families';

const NONE = 'none'; // people without a last name

const nameOf = (p) => `${p.firstName || ''} ${p.lastName || ''}`.trim();
const yearOf = (p) => (p.birthDate ? new Date(p.birthDate).getUTCFullYear() : null);

// Choose one person in two steps, so the list stays short when the family grows:
// first the family name, then the person (first names of that family only).
const PersonPicker = ({ people, value, onChange }) => {
  const { t } = useTranslation();
  const [family, setFamily] = useState('');

  const families = useMemo(() => {
    const list = familyOptions(people);
    const without = people.filter((p) => !String(p.lastName || '').trim());
    return without.length > 0 ? [...list, { value: NONE, label: t('pickerNoFamily'), count: without.length }] : list;
  }, [people, t]);

  const members = useMemo(() => {
    if (!family) return [];
    const list =
      family === NONE ? people.filter((p) => !String(p.lastName || '').trim()) : peopleOfFamily(people, family);
    return [...list].sort(
      (a, b) =>
        String(a.firstName || '').localeCompare(String(b.firstName || '')) ||
        (yearOf(a) ?? 9999) - (yearOf(b) ?? 9999)
    );
  }, [people, family]);

  const chooseFamily = (next) => {
    setFamily(next);
    onChange(''); // the person of the previous family no longer applies
  };

  return (
    <div className="person-picker">
      <select value={family} onChange={(e) => chooseFamily(e.target.value)} aria-label={t('pickerFamily')}>
        <option value="">{t('pickerFamilyPlaceholder')}</option>
        {families.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label} ({f.count})
          </option>
        ))}
      </select>
      <select
        value={value}
        disabled={!family}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t('selectPerson')}
      >
        <option value="">{family ? t('selectPerson') : t('pickerFirstHint')}</option>
        {members.map((p) => (
          <option key={p._id} value={p._id}>
            {nameOf(p)}
            {yearOf(p) ? ` (${yearOf(p)})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
};

export default PersonPicker;
