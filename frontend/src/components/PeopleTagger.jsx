import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normTag, suggestOptions } from '../utils/gallery';

// Who is in a photo: somebody from the family tree (picked from the list) or somebody else (a name).
// Nobody is added to the tree by tagging. With onPlace, each name can also be put on the picture.
//   value: [{ personId, name, x, y }]   family: people of the tree   outsiders: names used before
const PeopleTagger = ({ value, onChange, family = [], outsiders = [], onPlace, placingIndex = -1 }) => {
  const { t } = useTranslation();
  const [personId, setPersonId] = useState('');
  const [name, setName] = useState('');
  const list = value || [];

  const sorted = [...family].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  const taken = new Set(list.filter((p) => p.personId).map((p) => String(p.personId)));
  const takenNames = list.filter((p) => !p.personId).map((p) => p.name);

  const addFamily = (id) => {
    setPersonId('');
    const person = family.find((p) => p._id === id);
    if (!person || taken.has(id)) return;
    onChange([...list, { personId: id, name: `${person.firstName} ${person.lastName}`, x: null, y: null }]);
  };

  const addOutsider = (raw) => {
    const typed = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!typed) return;
    // the same name as one that exists already (other capitals) uses that one
    const found = [...outsiders, ...family.map((p) => `${p.firstName} ${p.lastName}`)].find((o) => normTag(o) === normTag(typed));
    const useName = found || typed;
    setName('');
    if (takenNames.some((n) => normTag(n) === normTag(useName))) return;
    const person = family.find((p) => `${p.firstName} ${p.lastName}` === useName);
    if (person) {
      addFamily(person._id); // the name is somebody of the family: tag that person instead
      return;
    }
    onChange([...list, { personId: null, name: useName, x: null, y: null }]);
  };

  const remove = (i) => onChange(list.filter((_, index) => index !== i));
  const { exact, matches, near } = suggestOptions(name, [...outsiders, ...family.map((p) => `${p.firstName} ${p.lastName}`)], [...takenNames]);

  return (
    <div className="people-tagger">
      {list.length > 0 && (
        <ul className="people-tag-list">
          {list.map((p, i) => (
            <li key={`${p.personId || p.name}-${i}`} className={i === placingIndex ? 'placing' : ''}>
              <span className="people-tag-name">
                {p.name}
                {!p.personId && <em> · {t('galleryOutside')}</em>}
              </span>
              {onPlace && (
                <button type="button" className="btn-secondary people-tag-btn" onClick={() => onPlace(i === placingIndex ? -1 : i)}>
                  {i === placingIndex ? t('galleryPlacing') : p.x === null ? t('galleryPlace') : t('galleryMove')}
                </button>
              )}
              <button type="button" className="btn-secondary people-tag-btn" onClick={() => remove(i)} aria-label={`${t('delete')} ${p.name}`}>×</button>
            </li>
          ))}
        </ul>
      )}
      {placingIndex >= 0 && <p className="people-place-hint">{t('galleryPlaceHint')}</p>}

      <div className="people-add">
        <select value={personId} onChange={(e) => addFamily(e.target.value)} aria-label={t('galleryTagFamily')}>
          <option value="">{t('galleryTagFamily')}</option>
          {sorted.filter((p) => !taken.has(p._id)).map((p) => (
            <option key={p._id} value={p._id}>{p.firstName} {p.lastName}</option>
          ))}
        </select>
        <input
          type="text"
          value={name}
          maxLength={80}
          placeholder={t('galleryTagOutside')}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addOutsider(name);
            }
          }}
        />
        <button type="button" className="btn-secondary" onClick={() => addOutsider(name)} disabled={!name.trim()}>{t('galleryTagAdd')}</button>
      </div>
      {name.trim() && (exact || matches.length > 0 || near.length > 0) && (
        <div className="tag-suggest">
          <div className="tag-suggest-row">
            <span className="tag-suggest-label">{near.length && !exact ? t('galleryDidYouMean') : t('galleryExisting')}</span>
            {[...(exact ? [exact] : []), ...matches, ...near].map((o) => (
              <button type="button" key={o} className="chip" onClick={() => addOutsider(o)}>{o}</button>
            ))}
          </div>
        </div>
      )}
      <small>{t('galleryTagNote')}</small>
    </div>
  );
};

export default PeopleTagger;
