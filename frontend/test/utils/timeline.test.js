import { describe, it, expect } from 'vitest';
import { buildTimeline, groupByYear } from '../../src/utils/timeline';

const people = [
  { _id: 'a', firstName: 'Ann', lastName: 'K', birthDate: '1950-03-10', deathDate: '2020-03-09' },
  { _id: 'b', firstName: 'Ben', lastName: 'K', birthDate: '1980-06-01' },
  { _id: 'c', firstName: 'Cy', lastName: 'K' }
];

describe('timeline', () => {
  it('lists births and deaths, oldest first, and skips people without dates', () => {
    const events = buildTimeline(people);
    expect(events.map((e) => `${e.kind}:${e.name}`)).toEqual(['born:Ann K', 'born:Ben K', 'died:Ann K']);
  });

  it('can show only births or only deaths', () => {
    expect(buildTimeline(people, 'born')).toHaveLength(2);
    expect(buildTimeline(people, 'died')).toHaveLength(1);
  });

  it('gives the age at death in whole years', () => {
    expect(buildTimeline(people, 'died')[0].age).toBe(69); // one day before the 70th birthday
  });

  it('adds photos with a date or a year, and skips photos without', () => {
    const photos = [
      { id: 'p1', caption: 'Wedding', date: '1975-05-05', image: '/a.jpg' },
      { id: 'p2', year: 1990, image: '/b.jpg' },
      { id: 'p3', image: '/c.jpg' }
    ];
    const all = buildTimeline(people, 'all', photos);
    expect(all.map((e) => e.key)).toEqual(['a-born', 'photo-p1', 'b-born', 'photo-p2', 'a-died']);
    expect(all.filter((e) => e.kind === 'photo').map((e) => e.name)).toEqual(['Wedding', 'Photo']);
    expect(buildTimeline(people, 'photo', photos)).toHaveLength(2);
    expect(buildTimeline(people, 'born', photos)).toHaveLength(2);
  });

  it('groups by year, newest or oldest first', () => {
    const events = buildTimeline(people);
    expect(groupByYear(events, 'oldest').map((g) => g.year)).toEqual([1950, 1980, 2020]);
    expect(groupByYear(events, 'newest').map((g) => g.year)).toEqual([2020, 1980, 1950]);
  });
});
