import { describe, it, expect } from 'vitest';
import { searchPeople, normalize } from '../../src/utils/search';

const people = [
  { _id: '1', firstName: 'Hélène', lastName: 'Mwamba' },
  { _id: '2', firstName: 'Gabriel', lastName: 'Mbala' },
  { _id: '3', firstName: 'Isaac', lastName: 'Mbala' },
  { _id: '4', firstName: 'Marie', lastName: 'Kabala Mbala' }
];
const ids = (list) => list.map((p) => p._id);

describe('search', () => {
  it('ignores capitals and accents', () => {
    expect(normalize('  HÉLÈNE ')).toBe('helene');
    expect(ids(searchPeople(people, 'helene'))).toEqual(['1']);
  });

  it('finds part of a name', () => {
    expect(ids(searchPeople(people, 'gab'))).toEqual(['2']);
  });

  it('needs every typed word, in any order', () => {
    expect(ids(searchPeople(people, 'mbala isaac'))).toEqual(['3']);
  });

  it('puts names that start with the text first', () => {
    // "mbala" starts the last name of 2 and 3, but only appears inside 4
    expect(ids(searchPeople(people, 'mbala'))).toEqual(['2', '3', '4']);
  });

  it('gives nothing for an empty search and respects the limit', () => {
    expect(searchPeople(people, '   ')).toEqual([]);
    expect(searchPeople(people, 'a', 2)).toHaveLength(2);
  });
});
