import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { personAPI } from '../api';
import { photoUrl } from '../utils/photo';
import { useDialog } from '../components/DialogProvider';

const PersonForm = () => {
  const { t } = useTranslation();
  const dialog = useDialog();
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    birthDate: '',
    deathDate: '',
    gender: 'male',
    description: '',
    parents: [],
    spouses: [], // in the order of the relationships: first partner first
    formerSpouses: [] // the partners from `spouses` whose relationship has ended
  });
  const [photo, setPhoto] = useState(null);
  const [existingPhoto, setExistingPhoto] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const photoInput = useRef(null);
  const [allPeople, setAllPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const siblingOf = searchParams.get('siblingOf');
  const childOf = searchParams.get('childOf');

  useEffect(() => {
    loadPeople();
    if (id) {
      loadPerson();
      setIsEdit(true);
    }
  }, [id]);

  const loadPeople = async () => {
    try {
      const response = await personAPI.getAll();
      setAllPeople(response.data);
      if (!id) prefill(response.data);
    } catch (error) {
      console.error('Error loading people:', error);
    }
  };

  // "Add a sibling" / "Add a child" from the tree: the parents are already filled in
  const prefill = (people) => {
    const parentIdsOf = (p) => (p.parents || []).map((x) => x._id || x);
    if (siblingOf) {
      const sibling = people.find((p) => p._id === siblingOf);
      if (sibling) {
        setFormData((f) => ({ ...f, lastName: sibling.lastName, parents: parentIdsOf(sibling) }));
      }
    } else if (childOf) {
      const parent = people.find((p) => p._id === childOf);
      if (parent) {
        setFormData((f) => ({
          ...f,
          parents: [parent._id],
          lastName: parent.gender === 'male' ? parent.lastName : f.lastName
        }));
      }
    }
  };

  const loadPerson = async () => {
    try {
      const response = await personAPI.getById(id);
      const person = response.data;
      setExistingPhoto(person.photo || null);
      setFormData({
        firstName: person.firstName,
        lastName: person.lastName,
        birthDate: person.birthDate ? person.birthDate.split('T')[0] : '',
        deathDate: person.deathDate ? person.deathDate.split('T')[0] : '',
        gender: person.gender,
        description: person.description,
        parents: person.parents?.map(p => p._id) || [],
        spouses: person.spouses?.map(s => s._id) || [],
        formerSpouses: (person.formerSpouses || []).map(s => s._id || s)
      });
    } catch (error) {
      console.error('Error loading person:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const data = new FormData();
    data.append('firstName', formData.firstName);
    data.append('lastName', formData.lastName);
    data.append('birthDate', formData.birthDate);
    data.append('deathDate', formData.deathDate);
    data.append('gender', formData.gender);
    data.append('description', formData.description);
    data.append('parents', JSON.stringify(formData.parents));
    data.append('spouses', JSON.stringify(formData.spouses));
    data.append('formerSpouses', JSON.stringify(formData.formerSpouses));
    if (photo) {
      data.append('photo', photo);
    } else if (removePhoto) {
      data.append('removePhoto', 'true');
    }

    try {
      if (isEdit) {
        await personAPI.update(id, data);
      } else {
        await personAPI.create(data);
      }
      navigate('/people');
    } catch (error) {
      console.error('Error saving person:', error);
      await dialog.alert(t('error'));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleMultiSelect = (field, value) => {
    const current = formData[field];
    if (current.includes(value)) {
      setFormData({
        ...formData,
        [field]: current.filter(v => v !== value)
      });
    } else {
      setFormData({
        ...formData,
        [field]: [...current, value]
      });
    }
  };

  // Un-ticking a partner also forgets that the relationship had ended
  const handleSpouseToggle = (personId) => {
    const selected = formData.spouses.includes(personId);
    setFormData({
      ...formData,
      spouses: selected
        ? formData.spouses.filter(v => v !== personId)
        : [...formData.spouses, personId],
      formerSpouses: formData.formerSpouses.filter(v => v !== personId)
    });
  };

  // Move a partner one place up or down (the order is the order of the relationships)
  const moveSpouse = (index, step) => {
    const next = [...formData.spouses];
    const target = index + step;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setFormData({ ...formData, spouses: next });
  };

  const toggleEnded = (personId) => {
    const ended = formData.formerSpouses.includes(personId);
    setFormData({
      ...formData,
      formerSpouses: ended
        ? formData.formerSpouses.filter(v => v !== personId)
        : [...formData.formerSpouses, personId]
    });
  };

  // The photo shown: a newly chosen one, or the saved one (until it is removed)
  const photoPreview = useMemo(() => {
    if (photo) return URL.createObjectURL(photo);
    if (existingPhoto && !removePhoto) return photoUrl(existingPhoto);
    return null;
  }, [photo, existingPhoto, removePhoto]);

  const clearPhoto = () => {
    setPhoto(null);
    setRemovePhoto(true);
    if (photoInput.current) photoInput.current.value = '';
  };

  // Who could be the other parent: the partners of the chosen parents, and the other parents of their children
  const coParentSuggestions = useMemo(() => {
    const selected = new Set(formData.parents);
    const byId = new Map(allPeople.map((p) => [p._id, p]));
    const found = new Map(); // id -> { person, with: names of the chosen parents }
    const add = (candidate, parent) => {
      const cid = candidate._id || candidate;
      if (!cid || cid === id || selected.has(cid) || !byId.has(cid)) return;
      const entry = found.get(cid) || { person: byId.get(cid), with: [] };
      const pName = `${parent.firstName} ${parent.lastName}`;
      if (!entry.with.includes(pName)) entry.with.push(pName);
      found.set(cid, entry);
    };
    for (const parentId of formData.parents) {
      const parent = byId.get(parentId);
      if (!parent) continue;
      (parent.spouses || []).forEach((s) => add(s, parent));
      (parent.children || []).forEach((c) => {
        const child = byId.get(c._id || c);
        (child?.parents || []).forEach((other) => {
          if ((other._id || other) !== parentId) add(other, parent);
        });
      });
    }
    return [...found.values()];
  }, [formData.parents, allPeople, id]);

  // Children the chosen parents already have: the person is their sibling
  const siblings = useMemo(() => {
    const seen = new Map();
    for (const parentId of formData.parents) {
      const parent = allPeople.find((p) => p._id === parentId);
      (parent?.children || []).forEach((c) => {
        const cid = c._id || c;
        if (cid !== id) {
          const child = allPeople.find((p) => p._id === cid);
          if (child) seen.set(cid, `${child.firstName} ${child.lastName}`);
        }
      });
    }
    return [...seen.values()];
  }, [formData.parents, allPeople, id]);

  const nameOf = (personId) => {
    const found = allPeople.find(p => p._id === personId);
    return found ? `${found.firstName} ${found.lastName}` : '?';
  };

  return (
    <div className="person-form">
      <h1>{isEdit ? t('editPerson') : t('addPerson')}</h1>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>{t('firstName')} *</label>
          <input
            type="text"
            name="firstName"
            value={formData.firstName}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label>{t('lastName')} *</label>
          <input
            type="text"
            name="lastName"
            value={formData.lastName}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label>{t('birthDate')}</label>
          <input
            type="date"
            name="birthDate"
            value={formData.birthDate}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>{t('deathDate')}</label>
          <input
            type="date"
            name="deathDate"
            value={formData.deathDate}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>{t('gender')} *</label>
          <select
            name="gender"
            value={formData.gender}
            onChange={handleChange}
            required
          >
            <option value="male">{t('male')}</option>
            <option value="female">{t('female')}</option>
            <option value="other">{t('other')}</option>
          </select>
        </div>
        <div className="form-group">
          <label>{t('photo')}</label>
          {photoPreview && (
            <div className="photo-edit">
              <img src={photoPreview} alt="" className="photo-edit-image" />
              <button type="button" className="btn-secondary" onClick={clearPhoto}>
                {t('removePhoto')}
              </button>
            </div>
          )}
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            onChange={(e) => {
              setPhoto(e.target.files[0] || null);
              setRemovePhoto(false);
            }}
          />
        </div>
        <div className="form-group">
          <label>{t('description')} ({t('optional')})</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={4}
          />
        </div>
        <div className="form-group">
          <label>{t('parents')}</label>
          <div className="multi-select">
            {allPeople.map(person => (
              <label key={person._id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.parents.includes(person._id)}
                  onChange={() => handleMultiSelect('parents', person._id)}
                />
                {person.firstName} {person.lastName}
              </label>
            ))}
          </div>
          {siblings.length > 0 && (
            <p className="parent-hint">{t('formSiblings', { names: siblings.join(', ') })}</p>
          )}
          {coParentSuggestions.length > 0 && (
            <div className="parent-hint">
              <span>{t('formOtherParent')}</span>
              <div className="chip-group">
                {coParentSuggestions.map(({ person, with: names }) => (
                  <button
                    type="button"
                    key={person._id}
                    className="chip chip-near"
                    onClick={() => handleMultiSelect('parents', person._id)}
                  >
                    + {person.firstName} {person.lastName}
                    <small> · {t('formPartnerOf', { name: names.join(' & ') })}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="form-group">
          <label>{t('spouses')}</label>
          <div className="multi-select">
            {allPeople.map(person => (
              <label key={person._id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.spouses.includes(person._id)}
                  onChange={() => handleSpouseToggle(person._id)}
                />
                {person.firstName} {person.lastName}
              </label>
            ))}
          </div>

          {formData.spouses.length > 0 && (
            <div className="spouse-order" style={{ marginTop: '0.75rem' }}>
              <strong>{t('partnerOrder', 'Partners, first to latest')}</strong>
              {formData.spouses.map((spouseId, index) => (
                <div
                  key={spouseId}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.35rem 0' }}
                >
                  <span style={{ flex: 1 }}>
                    {index + 1}. {nameOf(spouseId)}
                  </span>
                  <label className="checkbox-label" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={formData.formerSpouses.includes(spouseId)}
                      onChange={() => toggleEnded(spouseId)}
                    />
                    {t('relationshipEnded', 'Relationship ended')}
                  </label>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => moveSpouse(index, -1)}
                    disabled={index === 0}
                    aria-label={t('moveUp', 'Move up')}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => moveSpouse(index, 1)}
                    disabled={index === formData.spouses.length - 1}
                    aria-label={t('moveDown', 'Move down')}
                  >
                    ↓
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? t('loading') : t('save')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/people')}
          >
            {t('cancel')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PersonForm;