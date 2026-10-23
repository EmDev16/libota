// Puts a person back the way the activity log says it was.
const Person = require('../models/Person');
const { removePhoto } = require('./photoStorage');
const { personSnapshot, personName } = require('./audit');

class RestoreError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const existing = async (ids) => {
  if (ids.length === 0) return [];
  const found = await Person.find({ _id: { $in: ids } }).select('_id');
  return found.map((p) => String(p._id));
};

// Makes the "relationship ended" mark the same on both people of every partnership
const syncFormer = async (personId, spouses, former) => {
  const ended = former.map(String);
  const current = spouses.map(String).filter((id) => !ended.includes(id));
  if (ended.length) await Person.updateMany({ _id: { $in: ended } }, { $addToSet: { formerSpouses: personId } });
  if (current.length) await Person.updateMany({ _id: { $in: current } }, { $pull: { formerSpouses: personId } });
};

// Removes every link other people have to this person
const unlink = async (person) => {
  if (person.parents.length) await Person.updateMany({ _id: { $in: person.parents } }, { $pull: { children: person._id } });
  if (person.spouses.length) {
    await Person.updateMany({ _id: { $in: person.spouses } }, { $pull: { spouses: person._id, formerSpouses: person._id } });
  }
  if (person.children.length) await Person.updateMany({ _id: { $in: person.children } }, { $pull: { parents: person._id } });
};

// Makes other people point back to this person
const link = async (person) => {
  if (person.parents.length) await Person.updateMany({ _id: { $in: person.parents } }, { $addToSet: { children: person._id } });
  if (person.spouses.length) {
    await Person.updateMany({ _id: { $in: person.spouses } }, { $addToSet: { spouses: person._id } });
    await syncFormer(person._id, person.spouses, person.formerSpouses);
  }
  if (person.children.length) await Person.updateMany({ _id: { $in: person.children } }, { $addToSet: { parents: person._id } });
};

const dateOrNull = (value) => (value ? new Date(value) : null);

// Returns what to write in the log about the restore: { action, targetId, targetName, before, after, note }
async function restoreEntry(entry, admin) {
  const snap = entry.action === 'person.create' ? entry.after : entry.before;
  if (!snap || !snap._id) throw new RestoreError(400, 'This entry has nothing to restore');

  // --- a deleted person comes back
  if (entry.action === 'person.delete') {
    if (await Person.exists({ _id: snap._id })) throw new RestoreError(409, 'This person already exists');
    const parents = await existing(snap.parents || []);
    const spouses = await existing(snap.spouses || []);
    const children = await existing(snap.children || []);
    const person = new Person({
      _id: snap._id,
      firstName: snap.firstName,
      lastName: snap.lastName,
      birthDate: dateOrNull(snap.birthDate),
      deathDate: dateOrNull(snap.deathDate),
      gender: snap.gender,
      description: snap.description || '',
      photo: null, // the photo file was removed together with the person
      parents,
      spouses,
      formerSpouses: (snap.formerSpouses || []).filter((id) => spouses.includes(String(id))),
      children,
      createdBy: snap.createdBy || admin._id
    });
    await person.save();
    await link(person);
    return {
      action: 'person.create',
      targetId: String(person._id),
      targetName: personName(snap),
      before: null,
      after: await personSnapshot(person),
      note: snap.photo ? 'photo' : ''
    };
  }

  // --- a person that was added is removed again
  if (entry.action === 'person.create') {
    const person = await Person.findById(snap._id);
    if (!person) throw new RestoreError(409, 'This person is already deleted');
    const before = await personSnapshot(person);
    await unlink(person);
    await Person.findByIdAndDelete(person._id);
    if (person.photo && !(await Person.exists({ photo: person.photo }))) await removePhoto(person.photo);
    return { action: 'person.delete', targetId: String(person._id), targetName: personName(before), before, after: null, note: '' };
  }

  // --- a changed person gets its old values back
  if (entry.action === 'person.update') {
    const person = await Person.findById(snap._id);
    if (!person) throw new RestoreError(409, 'This person no longer exists. Restore the deletion first.');
    const before = await personSnapshot(person);

    const valid = await existing([...new Set([...(snap.parents || []), ...(snap.spouses || [])])]);
    const parents = (snap.parents || []).filter((id) => valid.includes(String(id)));
    const spouses = (snap.spouses || []).filter((id) => valid.includes(String(id)));
    const former = (snap.formerSpouses || []).filter((id) => spouses.includes(String(id)));

    const oldParents = person.parents.map(String);
    const oldSpouses = person.spouses.map(String);
    await Person.updateMany({ _id: { $in: oldParents.filter((p) => !parents.includes(p)) } }, { $pull: { children: person._id } });
    await Person.updateMany({ _id: { $in: parents.filter((p) => !oldParents.includes(p)) } }, { $addToSet: { children: person._id } });
    await Person.updateMany(
      { _id: { $in: oldSpouses.filter((s) => !spouses.includes(s)) } },
      { $pull: { spouses: person._id, formerSpouses: person._id } }
    );
    await Person.updateMany({ _id: { $in: spouses.filter((s) => !oldSpouses.includes(s)) } }, { $addToSet: { spouses: person._id } });
    await syncFormer(person._id, spouses, former);

    person.firstName = snap.firstName;
    person.lastName = snap.lastName;
    person.birthDate = dateOrNull(snap.birthDate);
    person.deathDate = dateOrNull(snap.deathDate);
    person.gender = snap.gender;
    person.description = snap.description || '';
    person.parents = parents;
    person.spouses = spouses;
    person.formerSpouses = former;
    await person.save();

    // A replaced photo file was deleted, so the current photo stays
    const photoKept = (snap.photo || null) !== (person.photo || null);
    return {
      action: 'person.update',
      targetId: String(person._id),
      targetName: personName(snap),
      before,
      after: await personSnapshot(person),
      note: photoKept ? 'photo' : ''
    };
  }

  throw new RestoreError(400, 'This kind of entry cannot be restored');
}

module.exports = { restoreEntry, RestoreError };
