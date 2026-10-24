const assert = require('assert');
const { deduceKinship } = require('../utils/kinship');

console.log('--- Running Kinship Deduction Unit Tests ---');

// Mock Persons
const dan = { _id: '1', firstName: 'Dan', lastName: 'Doe', gender: 'male' };
const lisa = { _id: '2', firstName: 'Lisa', lastName: 'Doe', gender: 'female' };
const ben = { _id: '3', firstName: 'Ben', lastName: 'Doe', gender: 'male' };
const ned = { _id: '4', firstName: 'Ned', lastName: 'Doe', gender: 'male' };
const sara = { _id: '5', firstName: 'Sara', lastName: 'Doe', gender: 'female' };
const leo = { _id: '6', firstName: 'Leo', lastName: 'Doe', gender: 'male' };
const max = { _id: '7', firstName: 'Max', lastName: 'Doe', gender: 'male' };
const emily = { _id: '8', firstName: 'Emily', lastName: 'Smith', gender: 'female' }; // Ben's wife

// 1. Same Person
{
  const res = deduceKinship(ben, ben, []);
  assert.strictEqual(res.relationshipKey, 'samePerson');
  assert.strictEqual(res.targetTitle, 'Self');
  console.log('✓ Same Person passed');
}

// 2. Spouse (Dan -> Lisa)
{
  const res = deduceKinship(dan, lisa, [{ from: '1', to: '2', type: 'spouse' }]);
  assert.strictEqual(res.relationshipKey, 'wife');
  assert.strictEqual(res.targetTitle, 'Wife');
  assert.strictEqual(res.mutualTitle, 'Spouses');
  console.log('✓ Spouse (Wife) passed');
}

// 3. Spouse (Lisa -> Dan)
{
  const res = deduceKinship(lisa, dan, [{ from: '2', to: '1', type: 'spouse' }]);
  assert.strictEqual(res.relationshipKey, 'husband');
  assert.strictEqual(res.targetTitle, 'Husband');
  console.log('✓ Spouse (Husband) passed');
}

// 4. Parent -> Child (Dan -> Ned)
{
  const res = deduceKinship(dan, ned, [{ from: '1', to: '4', type: 'child' }]);
  assert.strictEqual(res.relationshipKey, 'son');
  assert.strictEqual(res.targetTitle, 'Son');
  assert.strictEqual(res.mutualTitle, 'Father and Son');
  console.log('✓ Parent -> Son passed');
}

// 5. Child -> Parent (Ned -> Dan)
{
  const res = deduceKinship(ned, dan, [{ from: '4', to: '1', type: 'parent' }]);
  assert.strictEqual(res.relationshipKey, 'father');
  assert.strictEqual(res.targetTitle, 'Father');
  assert.strictEqual(res.mutualTitle, 'Father and Son');
  console.log('✓ Child -> Father passed');
}

// 6. Child -> Mother (Ned -> Lisa)
{
  const res = deduceKinship(ned, lisa, [{ from: '4', to: '2', type: 'parent' }]);
  assert.strictEqual(res.relationshipKey, 'mother');
  assert.strictEqual(res.targetTitle, 'Mother');
  assert.strictEqual(res.mutualTitle, 'Mother and Son');
  console.log('✓ Child -> Mother passed');
}

// 7. Brothers (Ben -> Ned)
{
  // UP to Dan, DOWN to Ned
  const res = deduceKinship(ben, ned, [
    { from: '3', to: '1', type: 'parent' },
    { from: '1', to: '4', type: 'child' }
  ]);
  assert.strictEqual(res.relationshipKey, 'brother');
  assert.strictEqual(res.targetTitle, 'Brother');
  assert.strictEqual(res.mutualKey, 'brothers');
  assert.strictEqual(res.mutualTitle, 'Brothers');
  console.log('✓ Sibling (Brother/Brothers) passed');
}

// 8. Brother -> Sister (Ned -> Sara)
{
  const res = deduceKinship(ned, sara, [
    { from: '4', to: '1', type: 'parent' },
    { from: '1', to: '5', type: 'child' }
  ]);
  assert.strictEqual(res.relationshipKey, 'sister');
  assert.strictEqual(res.targetTitle, 'Sister');
  assert.strictEqual(res.mutualKey, 'siblings');
  assert.strictEqual(res.mutualTitle, 'Siblings');
  console.log('✓ Sibling (Sister/Siblings) passed');
}

// 9. Uncle (Leo -> Ned)
{
  // Leo -> UP to Ben -> UP to Dan -> DOWN to Ned
  const res = deduceKinship(leo, ned, [
    { from: '6', to: '3', type: 'parent' },
    { from: '3', to: '1', type: 'parent' },
    { from: '1', to: '4', type: 'child' }
  ]);
  assert.strictEqual(res.relationshipKey, 'uncle');
  assert.strictEqual(res.targetTitle, 'Uncle');
  console.log('✓ Uncle passed');
}

// 10. Nephew (Ned -> Leo)
{
  // Ned -> UP to Dan -> DOWN to Ben -> DOWN to Leo
  const res = deduceKinship(ned, leo, [
    { from: '4', to: '1', type: 'parent' },
    { from: '1', to: '3', type: 'child' },
    { from: '3', to: '6', type: 'child' }
  ]);
  assert.strictEqual(res.relationshipKey, 'nephew');
  assert.strictEqual(res.targetTitle, 'Nephew');
  console.log('✓ Nephew passed');
}

// 11. Grandfather (Leo -> Dan)
{
  const res = deduceKinship(leo, dan, [
    { from: '6', to: '3', type: 'parent' },
    { from: '3', to: '1', type: 'parent' }
  ]);
  assert.strictEqual(res.relationshipKey, 'grandfather');
  assert.strictEqual(res.targetTitle, 'Grandfather');
  console.log('✓ Grandfather passed');
}

// 12. Grandson (Dan -> Leo)
{
  const res = deduceKinship(dan, leo, [
    { from: '1', to: '3', type: 'child' },
    { from: '3', to: '6', type: 'child' }
  ]);
  assert.strictEqual(res.relationshipKey, 'grandson');
  assert.strictEqual(res.targetTitle, 'Grandson');
  console.log('✓ Grandson passed');
}

// 13. First Cousins (Leo -> Max)
{
  // Leo -> UP to Ben -> UP to Dan -> DOWN to Ned -> DOWN to Max
  const res = deduceKinship(leo, max, [
    { from: '6', to: '3', type: 'parent' },
    { from: '3', to: '1', type: 'parent' },
    { from: '1', to: '4', type: 'child' },
    { from: '4', to: '7', type: 'child' }
  ]);
  assert.strictEqual(res.relationshipKey, 'firstCousin');
  assert.strictEqual(res.targetTitle, 'First Cousin');
  assert.strictEqual(res.mutualTitle, 'First Cousins');
  console.log('✓ First Cousin passed');
}

// 14. Second Cousins (UP 3, DOWN 3)
{
  const res = deduceKinship(leo, max, [
    { from: 'a', to: 'b', type: 'parent' },
    { from: 'b', to: 'c', type: 'parent' },
    { from: 'c', to: 'd', type: 'parent' },
    { from: 'd', to: 'e', type: 'child' },
    { from: 'e', to: 'f', type: 'child' },
    { from: 'f', to: 'g', type: 'child' }
  ]);
  assert.strictEqual(res.relationshipKey, 'cousin2nd');
  assert.strictEqual(res.targetTitle, 'Cousin (2nd)');
  console.log('✓ Second Cousin passed');
}

// 15. In-Laws (Daughter-in-law: Dan -> Emily)
{
  // Dan -> child (Ben) -> spouse (Emily)
  const res = deduceKinship(dan, emily, [
    { from: '1', to: '3', type: 'child' },
    { from: '3', to: '8', type: 'spouse' }
  ]);
  assert.strictEqual(res.relationshipKey, 'daughterInLaw');
  assert.strictEqual(res.targetTitle, 'Daughter-in-law');
  console.log('✓ Daughter-in-law passed');
}

// 16. In-Laws (Sister-in-law: Ned -> Emily)
{
  // Ned -> UP to Dan -> DOWN to Ben -> spouse (Emily)
  const res = deduceKinship(ned, emily, [
    { from: '4', to: '1', type: 'parent' },
    { from: '1', to: '3', type: 'child' },
    { from: '3', to: '8', type: 'spouse' }
  ]);
  assert.strictEqual(res.relationshipKey, 'sisterInLaw');
  assert.strictEqual(res.targetTitle, 'Sister-in-law');
  console.log('✓ Sister-in-law passed');
}


// --- Step-family, half-siblings and relatives by marriage ---
{
  const tags = (res) => `${res.relationshipKey}|${res.mutualKey}`;
  const P = (to) => ({ type: 'parent', to });
  const C = (to) => ({ type: 'child', to });
  const S = (to) => ({ type: 'spouse', to });

  // half-brother: same steps as a brother, but the context says only one parent is shared
  assert.strictEqual(tags(deduceKinship(ben, ned, [P('1'), C('4')], { halfSiblings: true })), 'halfBrother|halfSiblings');
  assert.strictEqual(tags(deduceKinship(ben, lisa, [P('1'), C('2')], { halfSiblings: true })), 'halfSister|halfSiblings');
  assert.strictEqual(tags(deduceKinship(ben, ned, [P('1'), C('4')])), 'brother|brothers');

  // step-parents, step-children, step-siblings
  assert.strictEqual(tags(deduceKinship(ben, emily, [P('1'), S('8')])), 'stepmother|stepFamily');
  assert.strictEqual(tags(deduceKinship(ben, dan, [P('9'), S('1')])), 'stepfather|stepFamily');
  assert.strictEqual(tags(deduceKinship(dan, ben, [S('2'), C('3')])), 'stepson|stepFamily');
  assert.strictEqual(tags(deduceKinship(dan, lisa, [S('2'), C('3')])), 'stepdaughter|stepFamily');
  assert.strictEqual(tags(deduceKinship(ben, lisa, [P('1'), S('9'), C('2')])), 'stepsister|stepFamily');
  assert.strictEqual(tags(deduceKinship(ben, ned, [P('1'), S('9'), C('4')])), 'stepbrother|stepFamily');
  assert.strictEqual(tags(deduceKinship(ben, emily, [P('1'), P('7'), S('8')])), 'stepGrandmother|stepFamily');
  assert.strictEqual(tags(deduceKinship(ben, ned, [S('9'), C('1'), C('4')])), 'stepGrandson|stepFamily');

  // Marc's parent is married to Isaac, whose parent is Daniel: Daniel is Marc's step-grandfather
  assert.strictEqual(tags(deduceKinship(ben, ned, [P('1'), S('9'), P('7')])), 'stepGrandfather|stepFamily');

  // relatives by marriage
  assert.strictEqual(tags(deduceKinship(ben, emily, [P('1'), P('7'), C('9'), S('8')])), 'auntInLaw|inLaws');
  assert.strictEqual(tags(deduceKinship(ben, ned, [P('1'), P('7'), C('9'), S('4')])), 'uncleInLaw|inLaws');
  assert.strictEqual(tags(deduceKinship(ben, emily, [P('1'), P('7'), C('9'), C('10'), S('8')])), 'cousinInLaw|inLaws');
  assert.strictEqual(tags(deduceKinship(ben, emily, [S('9'), P('1'), P('7'), C('2'), C('8')])), 'cousinInLaw|inLaws');
  assert.strictEqual(tags(deduceKinship(ben, ned, [S('9'), P('1'), P('7')])), 'grandfatherInLaw|inLaws');
  assert.strictEqual(tags(deduceKinship(ben, emily, [P('1'), C('2'), C('3'), S('8')])), 'nieceInLaw|inLaws');
  assert.strictEqual(tags(deduceKinship(ben, ned, [C('1'), C('2'), S('4')])), 'grandsonInLaw|inLaws');
  // a line that goes through the same partnership twice stays a general "relative"
  assert.strictEqual(tags(deduceKinship(ben, emily, [S('9'), P('1'), C('2'), S('8')])), 'relative|relatives');
  assert.strictEqual(tags(deduceKinship(ben, emily, [P('1'), P('7'), P('11'), C('7'), S('8')])), 'relativeInLaw|inLaws');
  console.log('✓ Step-family, half-siblings and in-laws passed');
}

console.log('All 16 kinship unit tests passed successfully!');
