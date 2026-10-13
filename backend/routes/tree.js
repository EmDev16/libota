const express = require('express');
const Person = require('../models/Person');
const { auth } = require('../middleware/auth');

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

    // BFS to find shortest path
    const findPath = async (startId, endId) => {
      const queue = [[startId]];
      const visited = new Set();

      while (queue.length > 0) {
        const path = queue.shift();
        const currentId = path[path.length - 1];

        if (currentId.toString() === endId.toString()) {
          return path;
        }

        if (visited.has(currentId.toString())) continue;
        visited.add(currentId.toString());

        const person = await Person.findById(currentId)
          .populate('parents')
          .populate('spouses')
          .populate('children');

        if (!person) continue;

        // Add parents
        for (const parent of person.parents || []) {
          if (!visited.has(parent._id.toString())) {
            queue.push([...path, parent._id]);
          }
        }

        // Add spouses
        for (const spouse of person.spouses || []) {
          if (!visited.has(spouse._id.toString())) {
            queue.push([...path, spouse._id]);
          }
        }

        // Add children
        for (const child of person.children || []) {
          if (!visited.has(child._id.toString())) {
            queue.push([...path, child._id]);
          }
        }
      }

      return null;
    };

    const path = await findPath(id1, id2);

    if (!path) {
      return res.json({ relationship: 'No relationship found', path: [] });
    }

    // Get person details for the path
    const pathPeople = await Person.find({ _id: { $in: path } })
      .select('firstName lastName');

    // Determine relationship type
    const relationship = determineRelationship(path);

    res.json({
      relationship,
      path: pathPeople
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to determine relationship type
function determineRelationship(path) {
  if (path.length === 1) {
    return 'Same person';
  }

  if (path.length === 2) {
    return 'Direct relationship (spouse)';
  }

  if (path.length === 3) {
    return 'Parent/Child';
  }

  if (path.length === 4) {
    return 'Grandparent/Grandchild';
  }

  if (path.length === 5) {
    return 'Great-grandparent/Great-grandchild';
  }

  // For longer paths, it could be various relationships
  const generations = path.length - 1;
  if (generations % 2 === 0) {
    // Even number of steps could be cousins, siblings, etc.
    return `Related (${generations} steps apart)`;
  } else {
    // Odd number of steps
    return `Related (${generations} steps apart)`;
  }
}

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
            _id: { $ne: { $in: rootPerson.parents } },
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
