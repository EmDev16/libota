import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normTag, suggestOptions } from '../utils/gallery';

// Tags (or one album) with the existing ones to pick from, so nobody types a near-copy of what is
// already there. `value` is a list of strings, or one string when `single` is set.
//   options:  what already exists
//   hashtag:  show values as #tag (and store them cleaned: lower case, no #)
const TagInput = ({ value, onChange, options = [], single = false, hashtag = true, placeholder, maxLength = 80, label }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  const list = single ? (value ? [value] : []) : value || [];
  const clean = (s) => (hashtag ? normTag(s) : String(s || '').trim().replace(/\s+/g, ' '));
  const { exact, matches, near } = suggestOptions(text, options, single ? [] : list);

  const commit = (list2) => onChange(single ? list2[list2.length - 1] || '' : list2);

  const add = (raw) => {
    const typed = clean(raw);
    if (!typed) return;
    // the same text as an existing value always uses the existing one
    const found = options.find((o) => normTag(o) === normTag(typed));
    const finalValue = found || typed;
    if (!single && list.some((v) => normTag(v) === normTag(finalValue))) {
      setText('');
      return;
    }
    commit([...(single ? [] : list), finalValue]);
    setText('');
  };

  const remove = (v) => commit(list.filter((x) => x !== v));

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && list.length > 0 && !single) {
      remove(list[list.length - 1]);
    }
  };

  const show = (v) => (hashtag ? `#${v}` : v);
  const showSuggestions = focused || text;
  const typedIsNew = clean(text) && !exact && !list.some((v) => normTag(v) === normTag(text));

  return (
    <div className="tag-input">
      {list.length > 0 && (
        <div className="chip-group tag-input-chosen">
          {list.map((v) => (
            <span key={v} className="chip chip-active tag-chip">
              {show(v)}
              <button type="button" className="tag-chip-x" onClick={() => remove(v)} aria-label={`${t('delete')} ${v}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={text}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // typed text is kept when leaving the field
          setFocused(false);
          if (text.trim()) add(text);
        }}
      />
      {showSuggestions && (matches.length > 0 || near.length > 0 || exact) && (
        <div className="tag-suggest">
          {exact && !list.some((v) => normTag(v) === normTag(exact)) && (
            <div className="tag-suggest-row">
              <span className="tag-suggest-label">{t('galleryAlreadyExists')}</span>
              <button type="button" className="chip" onMouseDown={(e) => e.preventDefault()} onClick={() => add(exact)}>{show(exact)}</button>
            </div>
          )}
          {near.length > 0 && (
            <div className="tag-suggest-row">
              <span className="tag-suggest-label">{t('galleryDidYouMean')}</span>
              {near.map((o) => (
                <button type="button" key={o} className="chip chip-near" onMouseDown={(e) => e.preventDefault()} onClick={() => add(o)}>{show(o)}</button>
              ))}
            </div>
          )}
          {matches.length > 0 && (
            <div className="tag-suggest-row">
              <span className="tag-suggest-label">{text ? t('galleryExisting') : t('galleryPickExisting')}</span>
              {matches.map((o) => (
                <button type="button" key={o} className="chip" onMouseDown={(e) => e.preventDefault()} onClick={() => add(o)}>{show(o)}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {typedIsNew && <small className="tag-new">{t('galleryNewValue', { value: show(clean(text)) })}</small>}
    </div>
  );
};

export default TagInput;
