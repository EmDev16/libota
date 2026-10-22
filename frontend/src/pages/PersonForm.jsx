import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { personAPI } from '../api';

const PersonForm = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
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
  const [allPeople, setAllPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isEdit, setIsEdit] = useState(false);

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
    } catch (error) {
      console.error('Error loading people:', error);
    }
  };

  const loadPerson = async () => {
    try {
      const response = await personAPI.getById(id);
      const person = response.data;
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
      alert(t('error'));
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
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files[0])}
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