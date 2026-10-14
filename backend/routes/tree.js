const express = require('express');
const Person = require('../models/Person');
const { auth } = require('../middleware/auth');
const { deduceKinship } = require('../utils/kinship');

const router = express.Router();

// Get complete tree data
router.get('/complete', auth, async (req, res) => {
  try {
    const people = await Person.find()
      .populate('parents', 'firstName lastName birthDate deathDate gender photo')
      .populate('spouses', 'firstName lastName birthDate deathDate gender photo')
      .populate('children', 'firstName lastName birthDate deathDate gender photo')
      .sort({ lastName: 1, firstName: 1 });

    res.json(people);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get tree starting from a specific person (ancestors and descendants)
router.get('/from/:id', auth, async (req, res) => {
  try {
    const rootPerson = await Person.findById(req.params.id)
      .populate('parents', 'firstName lastName birthDate deathDate gender photo')
      .populate('spouses', 'firstName lastName birthDate deathDate gender photo')
      .populate('children', 'firstName lastName birthDate deathDate gender photo');

    if (!rootPerson) {
      return res.status(404).json({ error: 'Person not found' });
    }

    // Get all descendants recursively
    const getDescendants = async (personId, visited = new Set()) => {
      if (visited.has(personId.toString())) return [];
      visited.add(personId.toString());

      const person = await Person.findById(personId)
        .populate('parents', 'firstName lastName birthDate deathDate gender photo')
        .populate('spouses', 'firstName lastName birthDate deathDate gender photo')
        .populate('children', 'firstName lastName birthDate deathDate gender photo');

      if (!person) return [];

      let descendants = [person];
      for (const child of person.children || []) {
        descendants = descendants.concat(await getDescendants(child._id, visited));
      }

      return descendants;
    };

    // Get all ancestors recursively
    const getAncestors = async (personId, visited = new Set()) => {
      if (visited.has(personId.toString())) return [];
      visited.add(personId.toString());

      const person = await Person.findById(personId)
        .populate('parents', 'firstName lastName birthDate deathDate gender photo')
        .populate('spouses', 'firstName lastName birthDate deathDate gender photo')
        .populate('children', 'firstName lastName birthDate deathDate gender photo');

      if (!person) return [];

      let ancestors = [person];
      for (const parent of person.parents || []) {
        ancestors = ancestors.concat(await getAncestors(parent._id, visited));
      }

      return ancestors;
    };

    const descendants = await getDescendants(rootPerson._id);
    const ancestors = await getAncestors(rootPerson._id);

    // Combine and deduplicate
    const allPeople = [...ancestors, ...descendants];
    const uniquePeople = allPeople.filter((person, index, self) =>
      index === self.findIndex(p => p._id.toString() === person._id.toString())
    );

    res.json(uniquePeople);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Find relationship between two people
router.get('/relationship/:id1/:id2', auth, async (req, res) => {
  try {
    const { id1, id2 } = req.params;

    const person1 = await Person.findById(id1);
    const person2 = await Person.findById(id2);

    if (!person1 || !person2) {
      return res.status(404).json({ error: 'One or both persons not found' });
    }

    // BFS to find shortest path with step directions
    const findPathWithSteps = async (startId, endId) => {
      if (startId.toString() === endId.toString()) {
        return { path: [startId], steps: [] };
      }

      const queue = [{
        currentId: startId,
        path: [startId],
        steps: []
      }];
      const visited = new Set();

      while (queue.length > 0) {
        const { currentId, path, steps } = queue.shift();
        const currentStr = currentId.toString();

        if (visited.has(currentStr)) continue;
        visited.add(currentStr);

        const person = await Person.findById(currentId)
          .populate('parents', '_id')
          .populate('spouses', '_id')
          .populate('children', '_id');

        if (!person) continue;

        // Try parents (UP)
        for (const parent of person.parents || []) {
          const parentId = parent._id;
          const parentStr = parentId.toString();
          if (parentStr === endId.toString()) {
            return {
              path: [...path, parentId],
              steps: [...steps, { from: currentId, to: parentId, type: 'parent' }]
            };
          }
          if (!visited.has(parentStr)) {
            queue.push({
              currentId: parentId,
              path: [...path, parentId],
              steps: [...steps, { from: currentId, to: parentId, type: 'parent' }]
            });
          }
        }

        // Try children (DOWN)
        for (const child of person.children || []) {
          const childId = child._id;
          const childStr = childId.toString();
          if (childStr === endId.toString()) {
            return {
              path: [...path, childId],
              steps: [...steps, { from: currentId, to: childId, type: 'child' }]
            };
          }
          if (!visited.has(childStr)) {
            queue.push({
              currentId: childId,
              path: [...path, childId],
              steps: [...steps, { from: currentId, to: childId, type: 'child' }]
            });
          }
        }

        // Try spouses (LATERAL)
        for (const spouse of person.spouses || []) {
          const spouseId = spouse._id;
          const spouseStr = spouseId.toString();
          if (spouseStr === endId.toString()) {
            return {
              path: [...path, spouseId],
              steps: [...steps, { from: currentId, to: spouseId, type: 'spouse' }]
            };
          }
          if (!visited.has(spouseStr)) {
            queue.push({
              currentId: spouseId,
              path: [...path, spouseId],
              steps: [...steps, { from: currentId, to: spouseId, type: 'spouse' }]
            });
          }
        }
      }

      return null;
    };

    const result = await findPathWithSteps(id1, id2);

    if (!result) {
      return res.json({
        relationship: 'No relationship found',
        relationshipKey: 'noRelationship',
        mutualRelationship: 'No relationship found',
        mutualKey: 'noRelationship',
        category: 'none',
        description: `No connection found between ${person1.firstName} and ${person2.firstName}`,
        path: []
      });
    }

    const { path, steps } = result;

    // Fetch person details for the path and preserve strict sequential order
    const pathPeople = await Person.find({ _id: { $in: path } })
      .select('firstName lastName gender photo');
    const peopleMap = new Map(pathPeople.map(p => [p._id.toString(), p]));

    const orderedPath = path.map((id, index) => {
      const p = peopleMap.get(id.toString());
      const stepToNext = steps[index] || null;
      const stepFromPrev = index > 0 ? steps[index - 1] : null;
      return {
        _id: id,
        firstName: p ? p.firstName : '',
        lastName: p ? p.lastName : '',
        gender: p ? p.gender : 'other',
        photo: p ? p.photo : null,
        relationToPrevious: stepFromPrev ? stepFromPrev.type : null,
        relationToNext: stepToNext ? stepToNext.type : null
      };
    });

    // Deduce rich kinship details
    const kinship = deduceKinship(person1, person2, steps);

    res.json({
      relationship: kinship.targetTitle,
      relationshipKey: kinship.relationshipKey,
      mutualRelationship: kinship.mutualTitle,
      mutualKey: kinship.mutualKey,
      category: kinship.category,
      description: kinship.description,
      person1: {
        _id: person1._id,
        firstName: person1.firstName,
        lastName: person1.lastName,
        gender: person1.gender
      },
      person2: {
        _id: person2._id,
        firstName: person2.firstName,
        lastName: person2.lastName,
        gender: person2.gender
      },
      steps,
      path: orderedPath
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get people by relationship type (e.g., all first cousins)
router.get('/filter/:type', auth, async (req, res) => {
  try {
    const { type } = req.params;
    const { rootId } = req.query;

    if (!rootId) {
      return res.status(400).json({ error: 'rootId parameter required' });
    }

    const rootPerson = await Person.findById(rootId);
    if (!rootPerson) {
      return res.status(404).json({ error: 'Root person not found' });
    }

    let people = [];

    switch (type) {
      case 'siblings':
        // Get siblings (share at least one parent)
        if (rootPerson.parents && rootPerson.parents.length > 0) {
          const siblings = await Person.find({
            _id: { $ne: rootPerson._id },
            parents: { $in: rootPerson.parents }
          }).populate('parents', 'firstName lastName');
          people = siblings;
        }
        break;

      case 'first-cousins':
        // Get first cousins (children of parents' siblings)
        if (rootPerson.parents && rootPerson.parents.length > 0) {
          const parentsSiblings = await Person.find({
            _id: { $nin: rootPerson.parents },
            parents: { $in: rootPerson.parents }
          });

          const cousinIds = [];
          for (const sibling of parentsSiblings) {
            const siblingsChildren = await Person.find({
              parents: sibling._id
            });
            cousinIds.push(...siblingsChildren.map(c => c._id));
          }

          people = await Person.find({ _id: { $in: cousinIds } });
        }
        break;

      case 'descendants':
        // Get all descendants
        const getDescendants = async (personId, visited = new Set()) => {
          if (visited.has(personId.toString())) return [];
          visited.add(personId.toString());

          const person = await Person.findById(personId)
            .populate('children', 'firstName lastName birthDate deathDate gender photo');

          if (!person) return [];

          let descendants = person.children || [];
          for (const child of person.children || []) {
            descendants = descendants.concat(await getDescendants(child._id, visited));
          }

          return descendants;
        };

        people = await getDescendants(rootPerson._id);
        break;

      default:
        return res.status(400).json({ error: 'Invalid relationship type' });
    }

    res.json(people);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
