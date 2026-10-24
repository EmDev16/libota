/**
 * Kinship deduction engine for Libota family tree
 */

/**
 * Given two persons and the directional steps connecting them,
 * returns rich kinship information including relationship keys for i18n,
 * specific titles, and mutual category descriptions.
 *
 * @param {Object} p1 Starting person { _id, firstName, lastName, gender }
 * @param {Object} p2 Target person { _id, firstName, lastName, gender }
 * @param {Array<{ from: string, to: string, type: 'parent'|'child'|'spouse' }>} steps
 * @param {{ halfSiblings?: boolean }} context extra facts the steps cannot show (siblings with one shared parent)
 */
function deduceKinship(p1, p2, steps, context = {}) {
  if (p1._id.toString() === p2._id.toString()) {
    return {
      relationshipKey: 'samePerson',
      mutualKey: 'samePerson',
      category: 'identity',
      targetTitle: 'Self',
      mutualTitle: 'Same person',
      description: `${p1.firstName} is the same person`
    };
  }

  if (!steps || steps.length === 0) {
    return {
      relationshipKey: 'noRelationship',
      mutualKey: 'noRelationship',
      category: 'none',
      targetTitle: 'No relation',
      mutualTitle: 'No relationship found',
      description: `No connection found between ${p1.firstName} and ${p2.firstName}`
    };
  }

  const p1Gender = (p1.gender || 'other').toLowerCase();
  const p2Gender = (p2.gender || 'other').toLowerCase();
  const stepTypes = steps.map(s => s.type);

  // 1. Direct Spouse
  if (stepTypes.length === 1 && stepTypes[0] === 'spouse') {
    const targetTitle = p2Gender === 'female' ? 'Wife' : (p2Gender === 'male' ? 'Husband' : 'Spouse');
    const targetKey = p2Gender === 'female' ? 'wife' : (p2Gender === 'male' ? 'husband' : 'spouse');
    return {
      relationshipKey: targetKey,
      mutualKey: 'spouses',
      category: 'spouses',
      targetTitle,
      mutualTitle: 'Spouses',
      description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
    };
  }

  // 2. Direct Parent
  if (stepTypes.length === 1 && stepTypes[0] === 'parent') {
    const targetTitle = p2Gender === 'female' ? 'Mother' : (p2Gender === 'male' ? 'Father' : 'Parent');
    const targetKey = p2Gender === 'female' ? 'mother' : (p2Gender === 'male' ? 'father' : 'parent');
    const mutualTitle = p2Gender === 'male' && p1Gender === 'male' ? 'Father and Son'
      : p2Gender === 'male' && p1Gender === 'female' ? 'Father and Daughter'
      : p2Gender === 'female' && p1Gender === 'male' ? 'Mother and Son'
      : p2Gender === 'female' && p1Gender === 'female' ? 'Mother and Daughter'
      : 'Parent and Child';
    return {
      relationshipKey: targetKey,
      mutualKey: 'parentAndChild',
      category: 'lineal',
      targetTitle,
      mutualTitle,
      description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
    };
  }

  // 3. Direct Child
  if (stepTypes.length === 1 && stepTypes[0] === 'child') {
    const targetTitle = p2Gender === 'female' ? 'Daughter' : (p2Gender === 'male' ? 'Son' : 'Child');
    const targetKey = p2Gender === 'female' ? 'daughter' : (p2Gender === 'male' ? 'son' : 'child');
    const mutualTitle = p1Gender === 'male' && p2Gender === 'male' ? 'Father and Son'
      : p1Gender === 'male' && p2Gender === 'female' ? 'Father and Daughter'
      : p1Gender === 'female' && p2Gender === 'male' ? 'Mother and Son'
      : p1Gender === 'female' && p2Gender === 'female' ? 'Mother and Daughter'
      : 'Parent and Child';
    return {
      relationshipKey: targetKey,
      mutualKey: 'parentAndChild',
      category: 'lineal',
      targetTitle,
      mutualTitle,
      description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
    };
  }

  // Check if pure blood relationship (only parent and child steps)
  const isPureBlood = stepTypes.every(t => t === 'parent' || t === 'child');

  if (isPureBlood) {
    // Count consecutive UP (parent) steps and then consecutive DOWN (child) steps
    const firstChildIdx = stepTypes.indexOf('child');
    const hasOnlyUpThenDown = firstChildIdx === -1 || stepTypes.slice(firstChildIdx).every(t => t === 'child');

    if (hasOnlyUpThenDown) {
      const upCount = firstChildIdx === -1 ? stepTypes.length : firstChildIdx;
      const downCount = firstChildIdx === -1 ? 0 : stepTypes.length - firstChildIdx;

      // 4. Siblings: UP 1, DOWN 1
      if (upCount === 1 && downCount === 1 && context.halfSiblings) {
        const targetTitle = p2Gender === 'female' ? 'Half-sister' : (p2Gender === 'male' ? 'Half-brother' : 'Half-sibling');
        const targetKey = p2Gender === 'female' ? 'halfSister' : (p2Gender === 'male' ? 'halfBrother' : 'halfSibling');
        return {
          relationshipKey: targetKey,
          mutualKey: 'halfSiblings',
          category: 'siblings',
          targetTitle,
          mutualTitle: 'Half-siblings',
          description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
        };
      }

      if (upCount === 1 && downCount === 1) {
        const targetTitle = p2Gender === 'female' ? 'Sister' : (p2Gender === 'male' ? 'Brother' : 'Sibling');
        const targetKey = p2Gender === 'female' ? 'sister' : (p2Gender === 'male' ? 'brother' : 'sibling');
        const mutualTitle = p1Gender === 'male' && p2Gender === 'male' ? 'Brothers'
          : p1Gender === 'female' && p2Gender === 'female' ? 'Sisters'
          : 'Siblings';
        const mutualKey = p1Gender === 'male' && p2Gender === 'male' ? 'brothers'
          : p1Gender === 'female' && p2Gender === 'female' ? 'sisters'
          : 'siblings';
        return {
          relationshipKey: targetKey,
          mutualKey,
          category: 'siblings',
          targetTitle,
          mutualTitle,
          description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
        };
      }

      // 5. Lineal Ancestors (all parent steps)
      if (downCount === 0) {
        if (upCount === 2) {
          const targetTitle = p2Gender === 'female' ? 'Grandmother' : (p2Gender === 'male' ? 'Grandfather' : 'Grandparent');
          const targetKey = p2Gender === 'female' ? 'grandmother' : (p2Gender === 'male' ? 'grandfather' : 'grandparent');
          return {
            relationshipKey: targetKey,
            mutualKey: 'grandparentAndGrandchild',
            category: 'lineal',
            targetTitle,
            mutualTitle: 'Grandparent and Grandchild',
            description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
          };
        }
        if (upCount === 3) {
          const targetTitle = p2Gender === 'female' ? 'Great-grandmother' : (p2Gender === 'male' ? 'Great-grandfather' : 'Great-grandparent');
          const targetKey = p2Gender === 'female' ? 'greatGrandmother' : (p2Gender === 'male' ? 'greatGrandfather' : 'greatGrandparent');
          return {
            relationshipKey: targetKey,
            mutualKey: 'grandparentAndGrandchild',
            category: 'lineal',
            targetTitle,
            mutualTitle: 'Great-grandparent and Great-grandchild',
            description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
          };
        }
        if (upCount > 3) {
          const prefix = 'Great-'.repeat(upCount - 2);
          const targetTitle = `${prefix}${p2Gender === 'female' ? 'grandmother' : (p2Gender === 'male' ? 'grandfather' : 'grandparent')}`;
          return {
            relationshipKey: 'ancestor',
            mutualKey: 'ancestors',
            category: 'lineal',
            targetTitle,
            mutualTitle: 'Ancestor and Descendant',
            description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
          };
        }
      }

      // 6. Lineal Descendants (all child steps)
      if (upCount === 0) {
        if (downCount === 2) {
          const targetTitle = p2Gender === 'female' ? 'Granddaughter' : (p2Gender === 'male' ? 'Grandson' : 'Grandchild');
          const targetKey = p2Gender === 'female' ? 'granddaughter' : (p2Gender === 'male' ? 'grandson' : 'grandchild');
          return {
            relationshipKey: targetKey,
            mutualKey: 'grandparentAndGrandchild',
            category: 'lineal',
            targetTitle,
            mutualTitle: 'Grandparent and Grandchild',
            description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
          };
        }
        if (downCount === 3) {
          const targetTitle = p2Gender === 'female' ? 'Great-granddaughter' : (p2Gender === 'male' ? 'Great-grandson' : 'Great-grandchild');
          const targetKey = p2Gender === 'female' ? 'greatGranddaughter' : (p2Gender === 'male' ? 'greatGrandson' : 'greatGrandchild');
          return {
            relationshipKey: targetKey,
            mutualKey: 'grandparentAndGrandchild',
            category: 'lineal',
            targetTitle,
            mutualTitle: 'Great-grandparent and Great-grandchild',
            description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
          };
        }
        if (downCount > 3) {
          const prefix = 'Great-'.repeat(downCount - 2);
          const targetTitle = `${prefix}${p2Gender === 'female' ? 'granddaughter' : (p2Gender === 'male' ? 'grandson' : 'grandchild')}`;
          return {
            relationshipKey: 'descendant',
            mutualKey: 'ancestors',
            category: 'lineal',
            targetTitle,
            mutualTitle: 'Ancestor and Descendant',
            description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
          };
        }
      }

      // 7. Uncle / Aunt: UP 2, DOWN 1 (Parent's Sibling)
      if (upCount === 2 && downCount === 1) {
        const targetTitle = p2Gender === 'female' ? 'Aunt' : (p2Gender === 'male' ? 'Uncle' : 'Aunt / Uncle');
        const targetKey = p2Gender === 'female' ? 'aunt' : (p2Gender === 'male' ? 'uncle' : 'auntOrUncle');
        const mutualTitle = p2Gender === 'male' && p1Gender === 'male' ? 'Uncle and Nephew'
          : p2Gender === 'male' && p1Gender === 'female' ? 'Uncle and Niece'
          : p2Gender === 'female' && p1Gender === 'male' ? 'Aunt and Nephew'
          : p2Gender === 'female' && p1Gender === 'female' ? 'Aunt and Niece'
          : 'Uncle/Aunt and Nephew/Niece';
        return {
          relationshipKey: targetKey,
          mutualKey: 'uncleAuntNephewNiece',
          category: 'collateral',
          targetTitle,
          mutualTitle,
          description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
        };
      }

      // 8. Nephew / Niece: UP 1, DOWN 2 (Sibling's Child)
      if (upCount === 1 && downCount === 2) {
        const targetTitle = p2Gender === 'female' ? 'Niece' : (p2Gender === 'male' ? 'Nephew' : 'Niece / Nephew');
        const targetKey = p2Gender === 'female' ? 'niece' : (p2Gender === 'male' ? 'nephew' : 'nephewOrNiece');
        const mutualTitle = p1Gender === 'male' && p2Gender === 'male' ? 'Uncle and Nephew'
          : p1Gender === 'male' && p2Gender === 'female' ? 'Uncle and Niece'
          : p1Gender === 'female' && p2Gender === 'male' ? 'Aunt and Nephew'
          : p1Gender === 'female' && p2Gender === 'female' ? 'Aunt and Niece'
          : 'Uncle/Aunt and Nephew/Niece';
        return {
          relationshipKey: targetKey,
          mutualKey: 'uncleAuntNephewNiece',
          category: 'collateral',
          targetTitle,
          mutualTitle,
          description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
        };
      }

      // 9. First Cousins: UP 2, DOWN 2
      if (upCount === 2 && downCount === 2) {
        return {
          relationshipKey: 'firstCousin',
          mutualKey: 'firstCousins',
          category: 'cousins',
          targetTitle: 'First Cousin',
          mutualTitle: 'First Cousins',
          description: `${p2.firstName} is ${p1.firstName}'s First Cousin`
        };
      }

      // 10. Second Cousins: UP 3, DOWN 3
      if (upCount === 3 && downCount === 3) {
        return {
          relationshipKey: 'cousin2nd',
          mutualKey: 'cousins',
          category: 'cousins',
          targetTitle: 'Cousin (2nd)',
          mutualTitle: 'Second Cousins',
          description: `${p2.firstName} is ${p1.firstName}'s Second Cousin`
        };
      }

      // 11. Third Cousins: UP 4, DOWN 4
      if (upCount === 4 && downCount === 4) {
        return {
          relationshipKey: 'cousin3rd',
          mutualKey: 'cousins',
          category: 'cousins',
          targetTitle: 'Cousin (3rd)',
          mutualTitle: 'Third Cousins',
          description: `${p2.firstName} is ${p1.firstName}'s Third Cousin`
        };
      }

      // 12. Great-Uncle / Great-Aunt: UP 3, DOWN 1
      if (upCount === 3 && downCount === 1) {
        const targetTitle = p2Gender === 'female' ? 'Great-Aunt' : (p2Gender === 'male' ? 'Great-Uncle' : 'Great-Aunt / Great-Uncle');
        return {
          relationshipKey: p2Gender === 'female' ? 'greatAunt' : 'greatUncle',
          mutualKey: 'uncleAuntNephewNiece',
          category: 'collateral',
          targetTitle,
          mutualTitle: 'Great-Uncle/Aunt and Great-Nephew/Niece',
          description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
        };
      }

      // 13. Great-Nephew / Great-Niece: UP 1, DOWN 3
      if (upCount === 1 && downCount === 3) {
        const targetTitle = p2Gender === 'female' ? 'Great-Niece' : (p2Gender === 'male' ? 'Great-Nephew' : 'Great-Niece / Great-Nephew');
        return {
          relationshipKey: p2Gender === 'female' ? 'greatNiece' : 'greatNephew',
          mutualKey: 'uncleAuntNephewNiece',
          category: 'collateral',
          targetTitle,
          mutualTitle: 'Great-Uncle/Aunt and Great-Nephew/Niece',
          description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
        };
      }

      // 14. First Cousin once removed: (UP 3, DOWN 2) or (UP 2, DOWN 3)
      if ((upCount === 3 && downCount === 2) || (upCount === 2 && downCount === 3)) {
        return {
          relationshipKey: 'cousinOnceRemoved',
          mutualKey: 'cousins',
          category: 'cousins',
          targetTitle: 'First Cousin (once removed)',
          mutualTitle: 'Cousins',
          description: `${p2.firstName} is ${p1.firstName}'s First Cousin once removed`
        };
      }

      // Fallback for distant blood cousins
      if (upCount >= 2 && downCount >= 2) {
        return {
          relationshipKey: 'cousin',
          mutualKey: 'cousins',
          category: 'cousins',
          targetTitle: 'Cousin',
          mutualTitle: 'Cousins',
          description: `${p2.firstName} is ${p1.firstName}'s Cousin`
        };
      }
    }
  }

  // 15. In-Laws and Step-Relations
  // Spouse's parent: ['spouse', 'parent']
  if (stepTypes.length === 2 && stepTypes[0] === 'spouse' && stepTypes[1] === 'parent') {
    const targetTitle = p2Gender === 'female' ? 'Mother-in-law' : (p2Gender === 'male' ? 'Father-in-law' : 'Parent-in-law');
    const targetKey = p2Gender === 'female' ? 'motherInLaw' : (p2Gender === 'male' ? 'fatherInLaw' : 'parentInLaw');
    return {
      relationshipKey: targetKey,
      mutualKey: 'inLaws',
      category: 'inLaws',
      targetTitle,
      mutualTitle: 'In-laws',
      description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
    };
  }

  // Child's spouse: ['child', 'spouse']
  if (stepTypes.length === 2 && stepTypes[0] === 'child' && stepTypes[1] === 'spouse') {
    const targetTitle = p2Gender === 'female' ? 'Daughter-in-law' : (p2Gender === 'male' ? 'Son-in-law' : 'Child-in-law');
    const targetKey = p2Gender === 'female' ? 'daughterInLaw' : (p2Gender === 'male' ? 'sonInLaw' : 'childInLaw');
    return {
      relationshipKey: targetKey,
      mutualKey: 'inLaws',
      category: 'inLaws',
      targetTitle,
      mutualTitle: 'In-laws',
      description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
    };
  }

  // Sibling's spouse: ['parent', 'child', 'spouse']
  // or Spouse's sibling: ['spouse', 'parent', 'child']
  if (
    (stepTypes.length === 3 && stepTypes[0] === 'parent' && stepTypes[1] === 'child' && stepTypes[2] === 'spouse') ||
    (stepTypes.length === 3 && stepTypes[0] === 'spouse' && stepTypes[1] === 'parent' && stepTypes[2] === 'child')
  ) {
    const targetTitle = p2Gender === 'female' ? 'Sister-in-law' : (p2Gender === 'male' ? 'Brother-in-law' : 'Sibling-in-law');
    const targetKey = p2Gender === 'female' ? 'sisterInLaw' : (p2Gender === 'male' ? 'brotherInLaw' : 'siblingInLaw');
    return {
      relationshipKey: targetKey,
      mutualKey: 'inLaws',
      category: 'inLaws',
      targetTitle,
      mutualTitle: 'In-laws',
      description: `${p2.firstName} is ${p1.firstName}'s ${targetTitle}`
    };
  }

  // 16. Other relatives by marriage and step-family: exactly one "spouse" step, with a blood line
  // (up the tree, then down) on one side or both sides of it
  const spouseAt = stepTypes.indexOf('spouse');
  if (spouseAt !== -1 && stepTypes.lastIndexOf('spouse') === spouseAt) {
    const line = (types) => {
      const firstChild = types.indexOf('child');
      const ups = firstChild === -1 ? types.length : firstChild;
      const downs = firstChild === -1 ? 0 : types.length - firstChild;
      const ok = types.slice(0, ups).every((x) => x === 'parent') && types.slice(ups).every((x) => x === 'child');
      return ok ? { up: ups, down: downs } : null;
    };
    const before = line(stepTypes.slice(0, spouseAt));
    const after = line(stepTypes.slice(spouseAt + 1));
    const by = (female, male, neutral) => (p2Gender === 'female' ? female : (p2Gender === 'male' ? male : neutral));
    const make = (titles, keys, mutualKey, mutualTitle, category) => ({
      relationshipKey: by(...keys),
      mutualKey,
      category,
      targetTitle: by(...titles),
      mutualTitle,
      description: `${p2.firstName} is ${p1.firstName}'s ${by(...titles)}`
    });
    const inLaw = (titles, keys) => make(titles, keys, 'inLaws', 'In-laws', 'inLaws');
    const step = (titles, keys) => make(titles, keys, 'stepFamily', 'Step-family', 'stepFamily');
    const at = (line2, up, down) => line2 && line2.up === up && line2.down === down;
    const generic = () => ({
      relationshipKey: 'relativeInLaw',
      mutualKey: 'inLaws',
      category: 'inLaws',
      targetTitle: 'Relative by marriage',
      mutualTitle: 'In-laws',
      description: `${p2.firstName} is a relative of ${p1.firstName} by marriage`
    });

    // a step-parent's own parent (parent, partner, parent) is a step-grandparent too
    if (at(before, 1, 0) && at(after, 1, 0)) {
      return step(['Step-grandmother', 'Step-grandfather', 'Step-grandparent'], ['stepGrandmother', 'stepGrandfather', 'stepGrandparent']);
    }

    // somebody's partner: a parent's partner (step-parent), a cousin's partner...
    if (before && after && after.up === 0 && after.down === 0 && !(before.up === 0 && before.down === 0)) {
      if (at(before, 1, 0)) return step(['Stepmother', 'Stepfather', 'Stepparent'], ['stepmother', 'stepfather', 'stepparent']);
      if (at(before, 2, 0)) return step(['Step-grandmother', 'Step-grandfather', 'Step-grandparent'], ['stepGrandmother', 'stepGrandfather', 'stepGrandparent']);
      if (at(before, 0, 2)) return inLaw(['Granddaughter-in-law', 'Grandson-in-law', 'Grandchild-in-law'], ['granddaughterInLaw', 'grandsonInLaw', 'grandchildInLaw']);
      if (at(before, 2, 1)) return inLaw(['Aunt by marriage', 'Uncle by marriage', 'Aunt / Uncle by marriage'], ['auntInLaw', 'uncleInLaw', 'auntOrUncleInLaw']);
      if (at(before, 1, 2)) return inLaw(['Niece by marriage', 'Nephew by marriage', 'Niece / Nephew by marriage'], ['nieceInLaw', 'nephewInLaw', 'nephewOrNieceInLaw']);
      if (at(before, 2, 2)) return inLaw(['Cousin by marriage', 'Cousin by marriage', 'Cousin by marriage'], ['cousinInLaw', 'cousinInLaw', 'cousinInLaw']);
      return generic();
    }

    // a partner's relative: a partner's child (step-child), a partner's cousin...
    if (before && after && before.up === 0 && before.down === 0 && !(after.up === 0 && after.down === 0)) {
      if (at(after, 0, 1)) return step(['Stepdaughter', 'Stepson', 'Stepchild'], ['stepdaughter', 'stepson', 'stepchild']);
      if (at(after, 0, 2)) return step(['Step-granddaughter', 'Step-grandson', 'Step-grandchild'], ['stepGranddaughter', 'stepGrandson', 'stepGrandchild']);
      if (at(after, 2, 0)) return inLaw(['Grandmother-in-law', 'Grandfather-in-law', 'Grandparent-in-law'], ['grandmotherInLaw', 'grandfatherInLaw', 'grandparentInLaw']);
      if (at(after, 2, 1)) return inLaw(['Aunt by marriage', 'Uncle by marriage', 'Aunt / Uncle by marriage'], ['auntInLaw', 'uncleInLaw', 'auntOrUncleInLaw']);
      if (at(after, 1, 2)) return inLaw(['Niece by marriage', 'Nephew by marriage', 'Niece / Nephew by marriage'], ['nieceInLaw', 'nephewInLaw', 'nephewOrNieceInLaw']);
      if (at(after, 2, 2)) return inLaw(['Cousin by marriage', 'Cousin by marriage', 'Cousin by marriage'], ['cousinInLaw', 'cousinInLaw', 'cousinInLaw']);
      return generic();
    }

    // a parent's partner's child: step-brother or step-sister
    if (at(before, 1, 0) && at(after, 0, 1)) {
      return step(['Stepsister', 'Stepbrother', 'Stepsibling'], ['stepsister', 'stepbrother', 'stepsibling']);
    }

    return generic();
  }

  // Generic relative fallback
  const stepsCount = stepTypes.length;
  return {
    relationshipKey: 'relative',
    mutualKey: 'relatives',
    category: 'extended',
    targetTitle: `Relative (${stepsCount} steps)`,
    mutualTitle: `Related (${stepsCount} steps)`,
    description: `${p2.firstName} is related to ${p1.firstName} (${stepsCount} steps apart)`
  };
}

module.exports = {
  deduceKinship
};
