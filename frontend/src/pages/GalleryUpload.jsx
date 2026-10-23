import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { galleryAPI } from '../api';
import { parseTags, readImageSize } from '../utils/gallery';

const MAX_FILES = 20;

// Admin: choose up to 20 photos, give them an album / year / tags together, and a caption each
const GalleryUpload = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [files, setFiles] = useState([]); // { key, file, preview, caption, date }
  const [common, setCommon] = useState({ album: '', year: '', tags: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const previews = useRef([]);

  // the previews are released when the page closes
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const choose = (e) => {
    const chosen = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length + chosen.length > MAX_FILES) {
      setError(t('galleryTooMany'));
      return;
    }
    setError('');
    const added = chosen.map((file, i) => {
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      return { key: `${Date.now()}-${files.length + i}`, file, preview, caption: '', date: '' };
    });
    setFiles((list) => [...list, ...added]);
  };

  const update = (key, patch) => setFiles((list) => list.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  const remove = (key) => setFiles((list) => list.filter((f) => f.key !== key));

  const submit = async (e) => {
    e.preventDefault();
    if (files.length === 0) {
      setError(t('galleryChoose'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const tags = parseTags(common.tags);
      const items = [];
      for (const f of files) {
        const size = await readImageSize(f.file);
        items.push({
          caption: f.caption,
          date: f.date,
          year: f.date ? '' : common.year,
          album: common.album,
          tags,
          width: size.width,
          height: size.height
        });
      }
      const data = new FormData();
      data.append('items', JSON.stringify(items));
      files.forEach((f) => data.append('photos', f.file));
      await galleryAPI.add(data);
      navigate('/gallery');
    } catch (err) {
      setError(err.response?.data?.error || t('error'));
      setBusy(false);
    }
  };

  return (
    <div className="person-form">
      <Link to="/gallery" className="log-back">← {t('galleryTitle')}</Link>
      <h1>{t('galleryAdd')}</h1>

      <form onSubmit={submit}>
        <div className="form-group">
          <label>{t('galleryChoose')}</label>
          <input type="file" accept="image/*" multiple onChange={choose} disabled={busy} />
          <small>{files.length} / {MAX_FILES}</small>
        </div>

        {files.length > 0 && (
          <>
            <h2>{t('galleryCommon')}</h2>
            <div className="form-group">
              <label>{t('galleryAlbum')}</label>
              <input type="text" value={common.album} maxLength={80} onChange={(e) => setCommon({ ...common, album: e.target.value })} />
            </div>
            <div className="form-group">
              <label>{t('galleryYear')}</label>
              <input type="number" min="1800" value={common.year} onChange={(e) => setCommon({ ...common, year: e.target.value })} />
            </div>
            <div className="form-group">
              <label>{t('galleryTags')}</label>
              <input type="text" value={common.tags} onChange={(e) => setCommon({ ...common, tags: e.target.value })} />
              <small>{t('galleryTagsHint')}</small>
            </div>

            <ul className="upload-list">
              {files.map((f) => (
                <li key={f.key} className="upload-item">
                  <img src={f.preview} alt="" className="upload-preview" />
                  <div className="upload-fields">
                    <input
                      type="text"
                      value={f.caption}
                      maxLength={300}
                      placeholder={t('galleryCaption')}
                      onChange={(e) => update(f.key, { caption: e.target.value })}
                    />
                    <input type="date" value={f.date} aria-label={t('galleryDate')} onChange={(e) => update(f.key, { date: e.target.value })} />
                  </div>
                  <button type="button" className="btn-secondary" onClick={() => remove(f.key)} disabled={busy}>
                    {t('suggestRemove')}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && <div className="error">{error}</div>}

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={busy || files.length === 0}>
            {busy ? t('galleryUploading') : t('galleryUpload')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default GalleryUpload;
