import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { galleryAPI, personAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { formatDate } from '../utils/dates';
import { photoUrl } from '../utils/photo';
import { thumbUrl, layoutColumns, columnCount } from '../utils/gallery';
import TagInput from '../components/TagInput';
import { useDialog } from '../components/DialogProvider';
import PeopleTagger from '../components/PeopleTagger';

const whenOf = (p) => (p.date ? formatDate(p.date) : p.year ? String(p.year) : '');

// A person on a photo is known by their id (family) or by their name (somebody else)
const personKeyOf = (x) => (x.personId ? `id:${x.personId}` : `name:${x.name.trim().toLowerCase()}`);

const PersonIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
  </svg>
);

const Lightbox = ({ photo, neighbors, hasPrev, hasNext, onPrev, onNext, onClose, onTag, onPerson, isAdmin, options, family, onSaved, onDeleted }) => {
  const { t } = useTranslation();
  const dialog = useDialog();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showTags, setShowTags] = useState(false);
  const [placing, setPlacing] = useState(-1);

  // the small copy (already loaded in the grid) shows at once; the sharp one replaces it when it is ready
  const lowSrc = thumbUrl(photoUrl(photo.image), 600);
  const highSrc = thumbUrl(photoUrl(photo.image), 2560, 'best');
  const [src, setSrc] = useState(lowSrc);
  useEffect(() => {
    setSrc(lowSrc);
    const img = new Image();
    img.onload = () => setSrc(highSrc);
    img.src = highSrc;
    return () => {
      img.onload = null;
    };
  }, [lowSrc, highSrc]);

  // the next and the previous photo are loaded in advance
  useEffect(() => {
    for (const n of neighbors || []) {
      const img = new Image();
      img.src = thumbUrl(photoUrl(n.image), 2560, 'best');
    }
  }, [neighbors]);

  // the keyboard works too: arrows move, Escape closes (not while typing in the edit form)
  useEffect(() => {
    const onKey = (e) => {
      if (editing) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
      if (e.key === 'ArrowRight' && hasNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, hasPrev, hasNext, onPrev, onNext, onClose]);

  useEffect(() => {
    setEditing(false);
    setError('');
    setShowTags(false);
    setPlacing(-1);
  }, [photo.id]);

  const startEdit = () => {
    setForm({
      caption: photo.caption || '',
      year: photo.year && !photo.date ? String(photo.year) : '',
      date: photo.date || '',
      album: photo.album || '',
      tags: photo.tags || [],
      hiddenTags: photo.hiddenTags || [],
      people: (photo.people || []).map((x) => ({ ...x }))
    });
    setPlacing(-1);
    setEditing(true);
  };

  const stopEdit = () => {
    setEditing(false);
    setPlacing(-1);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await galleryAPI.update(photo.id, {
        caption: form.caption,
        year: form.year,
        date: form.date,
        album: form.album,
        tags: form.tags,
        hiddenTags: form.hiddenTags,
        people: form.people.map(({ personId, name, x, y }) => ({ personId, name, x, y }))
      });
      onSaved(res.data);
      stopEdit();
    } catch (err) {
      setError(err.response?.data?.error || t('error'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await dialog.confirm(t('galleryDeleteConfirm'), { danger: true }))) return;
    setBusy(true);
    try {
      await galleryAPI.remove(photo.id);
      onDeleted(photo.id);
    } catch (err) {
      setError(err.response?.data?.error || t('error'));
      setBusy(false);
    }
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  // while editing the draft is shown, otherwise what is saved
  const people = editing ? form.people : photo.people || [];
  const placed = people.map((x, i) => ({ ...x, i })).filter((x) => x.x !== null && x.y !== null);

  const onImageClick = (e) => {
    if (editing) {
      if (placing < 0) return;
      const box = e.currentTarget.getBoundingClientRect();
      const x = Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100));
      const y = Math.min(100, Math.max(0, ((e.clientY - box.top) / box.height) * 100));
      setForm({
        ...form,
        people: form.people.map((p, i) => (i === placing ? { ...p, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 } : p))
      });
      setPlacing(-1);
    } else if (placed.length > 0) {
      setShowTags((v) => !v);
    }
  };

  const tagsVisible = editing || showTags;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <div className={`lightbox-card${editing ? ' editing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lightbox-close" onClick={onClose} aria-label={t('galleryClose')}>×</button>
        <div className="lightbox-stage">
          <button type="button" className="lightbox-nav" onClick={onPrev} disabled={!hasPrev} aria-label={t('galleryPrev')}>‹</button>
          <div className="lightbox-photo">
            <img
              src={src}
              alt={photo.caption || ''}
              className={`lightbox-image${editing && placing >= 0 ? ' placing' : ''}`}
              onClick={onImageClick}
            />
            {tagsVisible &&
              placed.map((x) => (
                <button
                  type="button"
                  key={`${personKeyOf(x)}-${x.i}`}
                  className="photo-tag"
                  style={{ left: `${x.x}%`, top: `${x.y}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!editing) onPerson(personKeyOf(x));
                  }}
                  tabIndex={editing ? -1 : 0}
                >
                  {x.name}
                </button>
              ))}
            {!editing && placed.length > 0 && (
              <button
                type="button"
                className={`photo-tags-toggle${showTags ? ' on' : ''}`}
                onClick={() => setShowTags((v) => !v)}
                aria-label={t('galleryShowTags')}
                aria-pressed={showTags}
              >
                <PersonIcon />
              </button>
            )}
          </div>
          <button type="button" className="lightbox-nav" onClick={onNext} disabled={!hasNext} aria-label={t('galleryNext')}>›</button>
        </div>

        {!editing ? (
          <div className="lightbox-info">
            {photo.caption && <p className="lightbox-caption">{photo.caption}</p>}
            <p className="lightbox-meta">
              {[whenOf(photo), photo.album].filter(Boolean).join(' · ')}
            </p>
            {(photo.people || []).length > 0 && (
              <div className="lightbox-people">
                <span className="lightbox-label">{t('galleryPeople')}</span>
                <div className="chip-group">
                  {photo.people.map((x, i) => (
                    <button type="button" key={`${personKeyOf(x)}-${i}`} className="chip chip-person" onClick={() => onPerson(personKeyOf(x))}>
                      {x.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {photo.tags.length > 0 && (
              <div className="chip-group">
                {photo.tags.map((tag) => (
                  <button type="button" key={tag} className="chip" onClick={() => onTag(tag)}>#{tag}</button>
                ))}
              </div>
            )}
            {isAdmin && (photo.hiddenTags || []).length > 0 && (
              <p className="lightbox-meta lightbox-hidden">
                {t('galleryHiddenTags')}: {photo.hiddenTags.map((x) => `#${x}`).join(' ')}
                {photo.inTimeline && ` · ${t('galleryOnTimeline')}`}
              </p>
            )}
            {isAdmin && (
              <div className="request-actions">
                <button type="button" className="btn-secondary" onClick={startEdit}>{t('edit')}</button>
                <button type="button" className="btn-danger" onClick={remove} disabled={busy}>{t('delete')}</button>
              </div>
            )}
            {error && <div className="error">{error}</div>}
          </div>
        ) : (
          <form className="lightbox-info lightbox-form" onSubmit={save}>
            <div className="form-group">
              <label>{t('galleryCaption')}</label>
              <input type="text" value={form.caption} maxLength={300} onChange={set('caption')} />
            </div>
            <div className="gallery-fields-row">
              <div className="form-group">
                <label>{t('galleryYear')}</label>
                <input type="number" value={form.year} min="1800" onChange={set('year')} />
              </div>
              <div className="form-group">
                <label>{t('galleryDate')}</label>
                <input type="date" value={form.date} onChange={set('date')} />
              </div>
            </div>
            <div className="form-group">
              <label>{t('galleryAlbum')}</label>
              <TagInput single hashtag={false} value={form.album} options={options.albums} onChange={(album) => setForm({ ...form, album })} />
            </div>
            <div className="form-group">
              <label>{t('galleryTags')}</label>
              <TagInput value={form.tags} options={options.tags} onChange={(tags) => setForm({ ...form, tags })} />
              <small>{t('galleryTagsHint')}</small>
            </div>
            <div className="form-group">
              <label>{t('galleryHiddenTags')}</label>
              <TagInput
                value={form.hiddenTags}
                options={[...new Set([...(options.hiddenTags || []), 'timeline'])]}
                onChange={(hiddenTags) => setForm({ ...form, hiddenTags })}
              />
              <small>{t('galleryHiddenHint')}</small>
            </div>
            <div className="form-group">
              <label>{t('galleryPeople')}</label>
              <PeopleTagger
                value={form.people}
                onChange={(next) => {
                  setForm({ ...form, people: next });
                  setPlacing(-1);
                }}
                family={family}
                outsiders={options.names}
                onPlace={setPlacing}
                placingIndex={placing}
              />
            </div>
            {error && <div className="error">{error}</div>}
            <div className="request-actions">
              <button type="submit" className="btn-primary" disabled={busy}>{t('save')}</button>
              <button type="button" className="btn-secondary" onClick={stopEdit}>{t('cancel')}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const Gallery = () => {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const [photos, setPhotos] = useState(null);
  const [failed, setFailed] = useState(false);
  const [album, setAlbum] = useState('');
  const [year, setYear] = useState('');
  const [tag, setTag] = useState('');
  const [query, setQuery] = useState('');
  const [person, setPerson] = useState(() => (params.get('person') ? `id:${params.get('person')}` : ''));
  const [openId, setOpenId] = useState(() => params.get('photo') || null);
  const [width, setWidth] = useState(1000);
  const [options, setOptions] = useState({ albums: [], tags: [], names: [], hiddenTags: [] });
  const [family, setFamily] = useState([]);
  const gridRef = useRef(null);

  const loadOptions = useCallback(() => {
    galleryAPI.options().then((res) => setOptions(res.data)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    galleryAPI
      .list()
      .then((res) => setPhotos(res.data))
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    load();
    loadOptions();
  }, [load, loadOptions]);

  // only an admin edits, and needs the people of the tree to tag them
  useEffect(() => {
    if (isAdmin) personAPI.getAll().then((res) => setFamily(res.data)).catch(() => {});
  }, [isAdmin]);

  // the links from the tree and the timeline (?person= and ?photo=) are used once, then removed
  useEffect(() => {
    if (params.get('person') || params.get('photo')) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the number of columns follows the width of the page
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [photos]);

  const albums = useMemo(() => [...new Set((photos || []).map((p) => p.album).filter(Boolean))].sort(), [photos]);
  const years = useMemo(
    () => [...new Set((photos || []).map((p) => p.year).filter(Boolean))].sort((a, b) => b - a),
    [photos]
  );
  const tags = useMemo(() => {
    const counts = new Map();
    for (const p of photos || []) for (const x of p.tags) counts.set(x, (counts.get(x) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  }, [photos]);
  // everybody who is tagged somewhere, for the "photos of ..." filter
  const tagged = useMemo(() => {
    const map = new Map();
    for (const p of photos || []) for (const x of p.people) map.set(personKeyOf(x), x.name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [photos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (photos || []).filter(
      (p) =>
        (!album || p.album === album) &&
        (!year || String(p.year) === year) &&
        (!tag || p.tags.includes(tag)) &&
        (!person || p.people.some((x) => personKeyOf(x) === person)) &&
        (!q || (p.caption || '').toLowerCase().includes(q))
    );
  }, [photos, album, year, tag, person, query]);

  const columns = useMemo(() => layoutColumns(filtered, columnCount(width)), [filtered, width]);

  const openIndex = filtered.findIndex((p) => p.id === openId);
  const neighborsOf = useMemo(
    () => [filtered[openIndex - 1], filtered[openIndex + 1]].filter(Boolean),
    [filtered, openIndex]
  );
  const filtering = album || year || tag || query || person;
  const personName = person ? (tagged.find(([k]) => k === person) || [])[1] : '';

  if (failed) return <div className="no-data">{t('error')}</div>;
  if (!photos) return <div className="loading">{t('loading')}</div>;

  const clear = () => {
    setAlbum('');
    setYear('');
    setTag('');
    setQuery('');
    setPerson('');
  };

  return (
    <div className="gallery-page">
      <div className="list-header">
        <h1>{t('galleryTitle')}</h1>
        {isAdmin && (
          <Link to="/gallery/new" className="btn-primary log-link">{t('galleryAdd')}</Link>
        )}
      </div>

      <div className="log-filters">
        <select value={album} onChange={(e) => setAlbum(e.target.value)} aria-label={t('galleryAlbum')}>
          <option value="">{t('galleryAllAlbums')}</option>
          {albums.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label={t('galleryYear')}>
          <option value="">{t('galleryAllYears')}</option>
          {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
        </select>
        {tagged.length > 0 && (
          <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label={t('galleryPeople')}>
            <option value="">{t('galleryAllPeople')}</option>
            {tagged.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            {person && !tagged.some(([k]) => k === person) && <option value={person}>{person}</option>}
          </select>
        )}
        <input type="search" value={query} placeholder={t('gallerySearch')} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {tags.length > 0 && (
        <div className="chip-group gallery-tags">
          {tags.map((x) => (
            <button
              type="button"
              key={x}
              className={`chip${tag === x ? ' chip-active' : ''}`}
              aria-pressed={tag === x}
              onClick={() => setTag(tag === x ? '' : x)}
            >
              #{x}
            </button>
          ))}
        </div>
      )}

      <p className="gallery-count">
        {personName ? t('galleryPhotosOf', { name: personName, n: filtered.length }) : t('galleryCount', { n: filtered.length, defaultValue: '{{n}} photos' })}
        {filtering && (
          <button type="button" className="gallery-clear" onClick={clear}>{t('galleryClear')}</button>
        )}
      </p>

      {filtered.length === 0 ? (
        <div className="no-data">{t('galleryEmpty')}</div>
      ) : (
        <div className="gallery-columns" ref={gridRef}>
          {columns.map((col, i) => (
            <div className="gallery-col" key={i}>
              {col.map((p) => (
                <button type="button" className="gallery-item" key={p.id} onClick={() => setOpenId(p.id)}>
                  <img
                    src={thumbUrl(photoUrl(p.image), 600)}
                    alt={p.caption || ''}
                    loading="lazy"
                    decoding="async"
                    style={p.width && p.height ? { aspectRatio: `${p.width} / ${p.height}` } : undefined}
                  />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {openIndex >= 0 && (
        <Lightbox
          photo={filtered[openIndex]}
          neighbors={neighborsOf}
          hasPrev={openIndex > 0}
          hasNext={openIndex < filtered.length - 1}
          onPrev={() => setOpenId(filtered[openIndex - 1].id)}
          onNext={() => setOpenId(filtered[openIndex + 1].id)}
          onClose={() => setOpenId(null)}
          onTag={(x) => {
            setTag(x);
            setOpenId(null);
          }}
          onPerson={(key) => {
            setPerson(key);
            setOpenId(null);
          }}
          isAdmin={isAdmin}
          options={options}
          family={family}
          onSaved={(updated) => {
            setPhotos((list) => list.map((p) => (p.id === updated.id ? updated : p)));
            loadOptions();
          }}
          onDeleted={(id) => {
            setPhotos((list) => list.filter((p) => p.id !== id));
            setOpenId(null);
            loadOptions();
          }}
        />
      )}
    </div>
  );
};

export default Gallery;
