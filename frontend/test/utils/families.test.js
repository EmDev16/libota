import { describe, it, expect } from 'vitest';
import { familyOptions, peopleOfFamily, oldestOfFamily } from '../../src/utils/families';

const people = [
  { _id: '1', firstName: 'Paul', lastName: 'Mbala', birthDate: '1950-05-05' },
  { _id: '2', firstName: 'Ana', lastName: 'Mbala Venia', birthDate: '1940-01-01' },
  { _id: '3', firstName: 'Eva', lastName: 'Venia', birthDate: '1930-01-01' },
  { _id: '4', firstName: 'Tom', lastName: 'Mbala' }, // no birth date
  { _id: '5', firstName: 'Ivo', lastName: 'Kalala', birthDate: '1960-01-01' }
];

describe('families by last name', () => {
  it('offers every word, and every last name made of several words', () => {
    expect(familyOptions(people).map((o) => `${o.label}:${o.count}`)).toEqual([
      'Kalala:1', 'Mbala:3', 'Mbala Venia:1', 'Venia:2'
    ]);
  });

  it('"Mbala" includes "Mbala Venia", but "Venia" alone is another family than "Mbala" alone', () => {
    expect(peopleOfFamily(people, 'word:mbala').map((p) => p._id)).toEqual(['1', '2', '4']);
    expect(peopleOfFamily(people, 'word:venia').map((p) => p._id)).toEqual(['2', '3']);
    expect(peopleOfFamily(people, 'full:mbala venia').map((p) => p._id)).toEqual(['2']);
  });

  it('finds the oldest, and puts people without a birth date last', () => {
    expect(oldestOfFamily(people, 'word:mbala')._id).toBe('2');
    expect(oldestOfFamily(people, 'full:mbala venia')._id).toBe('2');
    expect(oldestOfFamily([people[3], people[0]], 'word:mbala')._id).toBe('1');
    expect(oldestOfFamily(people, 'word:nobody')).toBeNull();
  });
});
