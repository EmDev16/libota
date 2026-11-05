// What the activity log shows for a change (no database needed).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { diff, changesOf } = require('../utils/auditDiff');

const photo = (extra = {}) => ({
  caption: '',
  album: '',
  tags: [],
  hiddenTags: [],
  people: [],
  takenYear: null,
  takenDate: null,
  ...extra
});

describe('activity log changes', () => {
  it('shows what changed on a photo', () => {
    const changes = changesOf({
      action: 'gallery.update',
      before: photo({ caption: 'Old', album: 'Summer', tags: ['beach'], people: ['Ann Doe'] }),
      after: photo({ caption: 'New', album: 'Summer', tags: ['beach', 'fun'], people: ['Ann Doe', 'Bob Doe'], takenDate: '2019-08-02' })
    });
    assert.deepEqual(
      changes.map((c) => [c.field, c.from, c.to]),
      [
        ['caption', 'Old', 'New'],
        ['tags', '#beach', '#beach #fun'],
        ['people', 'Ann Doe', 'Ann Doe, Bob Doe'],
        ['takenDate', '', '02/08/2019']
      ]
    );
  });

  it('does not list a photo list that only changed order', () => {
    const changes = changesOf({
      action: 'gallery.update',
      before: photo({ people: ['A', 'B'], tags: ['x', 'y'] }),
      after: photo({ people: ['B', 'A'], tags: ['y', 'x'] })
    });
    assert.deepEqual(changes, []);
  });

  it('lists what an added photo has, and what a deleted one had', () => {
    const created = changesOf({ action: 'gallery.create', after: photo({ album: 'Christmas', people: ['Ann Doe'] }) });
    assert.deepEqual(created.map((c) => [c.field, c.from, c.to]), [
      ['album', '', 'Christmas'],
      ['people', '', 'Ann Doe']
    ]);
    const deleted = changesOf({ action: 'gallery.delete', before: photo({ caption: 'Wedding', takenYear: 1990 }) });
    assert.deepEqual(deleted.map((c) => [c.field, c.from, c.to]), [
      ['caption', 'Wedding', ''],
      ['takenYear', '1990', '']
    ]);
  });

  it('lists the details of an added person, without empty fields', () => {
    const changes = changesOf({
      action: 'person.create',
      after: {
        firstName: 'Marc',
        lastName: 'Bolen',
        birthDate: '1950-04-01',
        deathDate: null,
        birthApprox: false,
        deceased: false,
        gender: 'male',
        description: '',
        parents: ['p1'],
        spouses: [],
        formerSpouses: [],
        linkNames: { p1: 'Anna Bolen' }
      }
    });
    assert.deepEqual(changes.map((c) => [c.field, c.to]), [
      ['firstName', 'Marc'],
      ['lastName', 'Bolen'],
      ['birthDate', '01/04/1950'],
      ['gender', 'male'],
      ['parents', 'Anna Bolen']
    ]);
  });

  it('still shows a person edit as before', () => {
    const base = { firstName: 'A', lastName: 'B', parents: ['p1'], spouses: [], formerSpouses: [], deceased: false };
    const changes = diff(
      { ...base, linkNames: { p1: 'Pa One' } },
      { ...base, parents: ['p2'], deceased: true, birthDate: '1990-01-02', linkNames: { p2: 'Pa Two' } }
    );
    assert.deepEqual(changes.map((c) => [c.field, c.from, c.to]), [
      ['birthDate', '', '02/01/1990'],
      ['deceased', '–', '✓'],
      ['parents', 'Pa One', 'Pa Two']
    ]);
  });

  it('has nothing to show for other actions', () => {
    assert.deepEqual(changesOf({ action: 'auth.login' }), []);
  });
});
