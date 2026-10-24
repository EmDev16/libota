import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { personAPI, requestAPI, galleryAPI, auditAPI } from '../api';
import { findUnlinkedPeople } from '../utils/treeLayout';
import { ACTIONS } from '../pages/ActivityLog';

const SHOWN = 5; // names listed per to-do item

const pad = (n) => String(n).padStart(2, '0');
const formatWhen = (value) => {
  const d = new Date(value);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// The gallery in numbers (a card in the statistics grid)
export const GalleryCard = () => {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState(null);
  useEffect(() => {
    galleryAPI.list().then((r) => setPhotos(r.data)).catch(() => {});
  }, []);
  return (
    <section className="insight-card">
      <h2>{t('galleryTitle')}</h2>
      {photos && (
    <dl className="facts">
      <dt>{t('galleryStatPhotos')}</dt>
      <dd>{photos.length}</dd>
      <dt>{t('galleryStatUntagged')}</dt>
      <dd>{photos.filter((p) => p.people.length === 0).length}</dd>
      <dt>{t('galleryStatUndated')}</dt>
      <dd>{photos.filter((p) => !p.date && !p.year).length}</dd>
      <dt>{t('galleryStatTimeline')}</dt>
      <dd>{photos.filter((p) => p.inTimeline).length}</dd>
    </dl>
      )}
      <p><Link to="/gallery" className="todo-link">{t('galleryOpen')}</Link></p>
    </section>

  );
};

// What needs the admin's attention, next to the latest activity (under everything)
const AdminOverview = ({ isAdmin = false }) => {
  const { t } = useTranslation();
  const [people, setPeople] = useState(null);
  const [pending, setPending] = useState(0);
  const [entries, setEntries] = useState(null);

  // each part loads on its own, so one failing does not hide the others
  useEffect(() => {
    personAPI.getAll().then((r) => setPeople(r.data)).catch(() => {});
    // suggestions and the activity log are for admins only
    if (isAdmin) {
      requestAPI.count().then((r) => setPending(r.data.pending)).catch(() => {});
      auditAPI.list({ page: 1 }).then((r) => setEntries(r.data.entries.slice(0, 5))).catch(() => {});
    }
  }, [isAdmin]);

  const name = (p) => `${p.firstName} ${p.lastName}`;
  const todos = [];
  if (people) {
    const noBirth = people.filter((p) => !p.birthDate);
    const noPhoto = people.filter((p) => !p.photo);
    const unlinked = people.length > 1 ? findUnlinkedPeople(people) : [];
    todos.push(
      { key: 'noBirth', label: t('todoNoBirth'), list: noBirth },
      { key: 'noPhoto', label: t('todoNoPhoto'), list: noPhoto },
      { key: 'unlinked', label: t('todoUnlinked'), list: unlinked }
    );
  }
  const open = todos.filter((x) => x.list.length > 0);

  return (
    <div className="admin-overview">
      <div className={`admin-bottom${isAdmin ? '' : ' admin-bottom-single'}`}>
        <section className="insight-card">
          <h2>{t('todoTitle')}</h2>
          {isAdmin && pending > 0 && (
            <p>
              <Link to="/admin/requests" className="todo-link">{t('todoPending', { n: pending })}</Link>
            </p>
          )}
          {open.length === 0 && pending === 0 && people && <p className="muted">{t('todoAllGood')}</p>}
          {open.map((x) => (
            <div key={x.key} className="todo-item">
              <h3>{x.label} ({x.list.length})</h3>
              <ul className="plain-list">
                {x.list.slice(0, SHOWN).map((p) => (
                  <li key={p._id}>
                    <Link to={isAdmin ? `/people/${p._id}/edit` : `/tree?person=${p._id}`} className="todo-link">{name(p)}</Link>
                  </li>
                ))}
                {x.list.length > SHOWN && <li className="muted">{t('todoMore', { n: x.list.length - SHOWN })}</li>}
              </ul>
            </div>
          ))}
        </section>

        {isAdmin && (
        <section className="insight-card">
          <h2>{t('recentActivityTitle')}</h2>
          {entries && entries.length === 0 && <p className="muted">{t('logNone')}</p>}
          {entries && entries.length > 0 && (
            <ul className="plain-list recent-activity">
              {entries.map((e) => (
                <li key={e.id}>
                  <span className="muted">{formatWhen(e.createdAt)}</span>{' '}
                  {t(ACTIONS[e.action] || 'logAction', e.action)}
                  {e.targetName ? ` · ${e.targetName}` : ''}
                  <div className="muted">{e.username || '—'}{e.status === 'fail' ? ` · ${t('logFail')}` : ''}</div>
                </li>
              ))}
            </ul>
          )}
          <p><Link to="/admin/log" className="todo-link">{t('recentActivityAll')}</Link></p>
        </section>
        )}
      </div>
    </div>
  );
};

export default AdminOverview;
