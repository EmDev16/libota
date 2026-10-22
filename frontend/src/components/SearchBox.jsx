import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { personAPI } from '../api';
import { searchPeople } from '../utils/search';

const years = (p) => {
  const b = p.birthDate ? new Date(p.birthDate).getUTCFullYear() : '?';
  const d = p.deathDate ? new Date(p.deathDate).getUTCFullYear() : '';
  return d ? `${b} – ${d}` : `${b}`;
};

// Search box in the navbar. The list of people is loaded the first time the box is used.
const SearchBox = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [people, setPeople] = useState(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);

  const load = async () => {
    if (people) return;
    try {
      const response = await personAPI.getAll();
      setPeople(response.data);
    } catch (error) {
      console.error('Search could not load the people:', error);
      setPeople([]);
    }
  };

  const results = useMemo(() => (people ? searchPeople(people, query) : []), [people, query]);

  useEffect(() => setActive(0), [query]);

  // a click outside closes the list
  useEffect(() => {
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = (person) => {
    setQuery('');
    setOpen(false);
    navigate(`/tree?person=${person._id}`);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && query.trim().length > 0;

  return (
    <div className="nav-search" ref={boxRef}>
      <input
        type="search"
        value={query}
        placeholder={t('searchPeople', 'Search a person…')}
        aria-label={t('searchPeople', 'Search a person…')}
        onFocus={() => {
          load();
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul className="search-results" role="listbox">
          {people === null && <li className="search-empty">{t('loading')}</li>}
          {people !== null && results.length === 0 && (
            <li className="search-empty">{t('noResults', 'No one found')}</li>
          )}
          {results.map((p, i) => (
            <li
              key={p._id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
            >
              <span className="search-name">
                {p.firstName} {p.lastName}
              </span>
              <span className="search-years">{years(p)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchBox;
