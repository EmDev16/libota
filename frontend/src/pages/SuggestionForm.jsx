import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { personAPI, requestAPI } from '../api';
import SuggestionTabs from '../components/SuggestionTabs';

const FIELDS = ['firstName', 'lastName', 'birthDate', 'deathDate', 'gender', 'description'];
const MAX_ITEMS = 10;

let nextKey = 1;
const emptyItem = (type = 'correction') => ({
  key: nextKey++,
  type,
  personId: '',
  current: null, // what the person has now, to send only what the member changed
  values: { firstName: '', lastName: '', birthDate: '', deathDate: '', gender: 'female', description: '' },
  relation: '',
  note: '',
  photo: null
});

const day = (value) => (value ? String(value).slice(0, 10) : '');

const SuggestionForm = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [people, setPeople] = useState([]);
  const [items, setItems] = useState(() => [emptyItem()]);
  const [sender, setSender] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInputs = useRef({});

  useEffect(() => {
    personAPI.getAll().then((res) => setPeople(res.data)).catch(() => setError(t('error')));
  }, [t]);

  const update = (key, patch) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const setValue = (key, field, value) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, values: { ...it.values, [field]: value } } : it)));

  const changeType = (key, type) => {
    update(key, { type, personId: '', current: null, relation: '' });
    if (type === 'me') setValue(key, 'gender', 'female');
  };

  const choosePerson = (key, personId) => {
    const person = people.find((p) => p._id === personId);
    if (!person) {
      update(key, { personId: '', current: null });
      return;
    }
    const current = {
      firstName: person.firstName || '',
      lastName: person.lastName || '',
      birthDate: day(person.birthDate),
      deathDate: day(person.deathDate),
      gender: person.gender || 'other',
      description: person.description || ''
    };
    update(key, { personId, current, values: { ...current } });
  };

  const addItem = () => setItems((list) => (list.length < MAX_ITEMS ? [...list, emptyItem()] : list));
  const removeItem = (key) => setItems((list) => (list.length > 1 ? list.filter((it) => it.key !== key) : list));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Only what the member changed is sent for a correction
    const payload = [];
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      if (it.type === 'correction') {
        const changes = {};
        for (const f of FIELDS) {
          if (it.current && it.values[f] !== it.current[f] && it.values[f] !== '') changes[f] = it.values[f];
        }
        if (!it.personId || (Object.keys(changes).length === 0 && !it.photo)) {
          setError(t('suggestNothing'));
          return;
        }
        payload.push({ type: 'correction', personId: it.personId, changes, note: it.note });
      } else {
        payload.push({ type: it.type, newPerson: it.values, relation: it.relation, note: it.note });
      }
    }

    const data = new FormData();
    data.append('senderName', sender);
    data.append('items', JSON.stringify(payload));
    items.forEach((it, i) => {
      if (it.photo) data.append(`photo_${i}`, it.photo);
    });

    setBusy(true);
    try {
      await requestAPI.send(data);
      navigate('/my-requests', { state: { sent: true } });
    } catch (err) {
      setError(err.response?.data?.error || t('error'));
    } finally {
      setBusy(false);
    }
  };

  const personFields = (it, only) =>
    FIELDS.filter((f) => !only || only.includes(f)).map((f) => {
      const label = t(f);
      if (f === 'gender') {
        return (
          <div className="form-group" key={f}>
            <label>{label}</label>
            <select value={it.values.gender} onChange={(e) => setValue(it.key, f, e.target.value)}>
              <option value="male">{t('male')}</option>
              <option value="female">{t('female')}</option>
              <option value="other">{t('other')}</option>
            </select>
          </div>
        );
      }
      if (f === 'description') {
        return (
          <div className="form-group" key={f}>
            <label>{label}</label>
            <textarea rows={3} value={it.values[f]} onChange={(e) => setValue(it.key, f, e.target.value)} />
          </div>
        );
      }
      return (
        <div className="form-group" key={f}>
          <label>
            {label}
            {it.type !== 'correction' && (f === 'firstName' || f === 'lastName') ? ' *' : ''}
          </label>
          <input
            type={f.endsWith('Date') ? 'date' : 'text'}
            value={it.values[f]}
            onChange={(e) => setValue(it.key, f, e.target.value)}
            maxLength={f.endsWith('Name') ? 80 : undefined}
            required={it.type !== 'correction' && (f === 'firstName' || f === 'lastName')}
          />
        </div>
      );
    });

  return (
    <div className="person-form suggestion-form">
      <SuggestionTabs current="new" />
      <h1>{t('suggestTitle')}</h1>

      <form onSubmit={handleSubmit}>
        {items.map((it, index) => (
          <fieldset className="suggestion-item" key={it.key}>
            <legend>{t('suggestionN', { n: index + 1, defaultValue: 'Suggestion {{n}}' })}</legend>

            <div className="form-group">
              <select value={it.type} onChange={(e) => changeType(it.key, e.target.value)} aria-label={t('suggestType')}>
                <option value="correction">{t('suggestTypeFix')}</option>
                <option value="newPerson">{t('suggestTypeNew')}</option>
                <option value="me">{t('suggestTypeMe')}</option>
              </select>
            </div>

            {it.type === 'correction' && (
              <div className="form-group">
                <label>{t('suggestPerson')}</label>
                <select value={it.personId} onChange={(e) => choosePerson(it.key, e.target.value)} required>
                  <option value="">{t('suggestChoosePerson')}</option>
                  {people.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.firstName} {p.lastName}
                      {p.birthDate ? ` (${String(p.birthDate).slice(0, 4)})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(it.type !== 'correction' || it.personId) && personFields(it)}

            {it.type !== 'correction' && (
              <div className="form-group">
                <label>{t('suggestRelation')}</label>
                <input type="text" value={it.relation} maxLength={200} onChange={(e) => update(it.key, { relation: e.target.value })} />
              </div>
            )}

            {(it.type !== 'correction' || it.personId) && (
              <div className="form-group">
                <label>{t('photo')}</label>
                <input
                  type="file"
                  accept="image/*"
                  ref={(el) => { fileInputs.current[it.key] = el; }}
                  onChange={(e) => update(it.key, { photo: e.target.files[0] || null })}
                />
              </div>
            )}

            <div className="form-group">
              <label>{t('suggestNote')}</label>
              <input type="text" value={it.note} maxLength={500} onChange={(e) => update(it.key, { note: e.target.value })} />
            </div>

            {items.length > 1 && (
              <button type="button" className="btn-secondary" onClick={() => removeItem(it.key)}>
                {t('suggestRemove')}
              </button>
            )}
          </fieldset>
        ))}

        {items.length < MAX_ITEMS && (
          <button type="button" className="btn-secondary suggest-add" onClick={addItem}>
            + {t('suggestAddAnother')}
          </button>
        )}

        <div className="form-group">
          <label>{t('suggestSender')}</label>
          <input type="text" value={sender} maxLength={60} onChange={(e) => setSender(e.target.value)} />
        </div>

        {error && <div className="error">{error}</div>}

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t('loading') : t('suggestSend')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SuggestionForm;
