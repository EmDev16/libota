import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { galleryAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { formatDate } from '../utils/dates';
import { photoUrl } from '../utils/photo';
import { thumbUrl, layoutColumns, columnCount, parseTags } from '../utils/gallery';

const whenOf = (p) => (p.date ? formatDate(p.date) : p.year ? String(p.year) : '');

const Lightbox = ({ photo, hasPrev, hasNext, onPrev, onNext, onClose, onTag, isAdmin, onSaved, onDeleted }) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
  }, [photo.id]);

  const startEdit = () => {
    setForm({
      caption: photo.caption || '',
      year: photo.year && !photo.date ? String(photo.year) : '',
      date: photo.date || '',
      album: photo.album || '',
      tags: (photo.tags || []).join(', ')
    });
    setEditing(true);
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
        tags: parseTags(form.tags)
      });
      onSaved(res.data);
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.error || t('error'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t('galleryDeleteConfirm'))) return;
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

  return (
    <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="lightbox-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lightbox-close" onClick={onClose} aria-label={t('galleryClose')}>×</button>
        <div className="lightbox-stage">
          <button type="button" className="lightbox-nav" onClick={onPrev} disabled={!hasPrev} aria-label={t('galleryPrev')}>‹</button>
          <img src={thumbUrl(photoUrl(photo.image), 1600)} alt={photo.caption || ''} className="lightbox-image" />
          <button type="button" className="lightbox-nav" onClick={onNext} disabled={!hasNext} aria-label={t('galleryNext')}>›</button>
        </div>

        {!editing ? (
          <div className="lightbox-info">
            {photo.caption && <p className="lightbox-caption">{photo.caption}</p>}
            <p className="lightbox-meta">
              {[whenOf(photo), photo.album].filter(Boolean).join(' · ')}
            </p>
            {photo.tags.length > 0 && (
              <div className="chip-group">
                {photo.tags.map((tag) => (
                  <button type="button" key={tag} className="chip" onClick={() => onTag(tag)}>#{tag}</button>
                ))}
              </div>
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
              <input type="text" value={form.album} maxLength={80} onChange={set('album')} />
            </div>
            <div className="form-group">
              <label>{t('galleryTags')}</label>
              <input type="text" value={form.tags} onChange={set('tags')} />
              <small>{t('galleryTagsHint')}</small>
            </div>
            {error && <div className="error">{error}</div>}
            <div className="request-actions">
              <button type="submit" className="btn-primary" disabled={busy}>{t('save')}</button>
              <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>{t('cancel')}</button>
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
  const [photos, setPhotos] = useState(null);
  const [failed, setFailed] = useState(false);
  const [album, setAlbum] = useState('');
  const [year, setYear] = useState('');
  const [tag, setTag] = useState('');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [width, setWidth] = useState(1000);
  const gridRef = useRef(null);

  const load = useCallback(() => {
    galleryAPI
      .list()
      .then((res) => setPhotos(res.data))
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (photos || []).filter(
      (p) =>
        (!album || p.album === album) &&
        (!year || String(p.year) === year) &&
        (!tag || p.tags.includes(tag)) &&
        (!q || (p.caption || '').toLowerCase().includes(q))
    );
  }, [photos, album, year, tag, query]);

  const columns = useMemo(() => layoutColumns(filtered, columnCount(width)), [filtered, width]);

  const openIndex = filtered.findIndex((p) => p.id === openId);
  const filtering = album || year || tag || query;

  if (failed) return <div className="no-data">{t('error')}</div>;
  if (!photos) return <div className="loading">{t('loading')}</div>;

  const clear = () => {
    setAlbum('');
    setYear('');
    setTag('');
    setQuery('');
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
        {t('galleryCount', { n: filtered.length, defaultValue: '{{n}} photos' })}
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
          hasPrev={openIndex > 0}
          hasNext={openIndex < filtered.length - 1}
          onPrev={() => setOpenId(filtered[openIndex - 1].id)}
          onNext={() => setOpenId(filtered[openIndex + 1].id)}
          onClose={() => setOpenId(null)}
          onTag={(x) => {
            setTag(x);
            setOpenId(null);
          }}
          isAdmin={isAdmin}
          onSaved={(updated) => setPhotos((list) => list.map((p) => (p.id === updated.id ? updated : p)))}
          onDeleted={(id) => {
            setPhotos((list) => list.filter((p) => p.id !== id));
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
};

export default Gallery;
