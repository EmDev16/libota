import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { auditAPI } from '../api';

const ACTIONS = {
  'person.create': 'logPersonAdded',
  'person.update': 'logPersonEdited',
  'person.delete': 'logPersonDeleted',
  'auth.login': 'logLogin',
  'auth.register': 'logAccountCreated',
  'auth.password': 'logPasswordChanged',
  'auth.reset-password': 'logPasswordReset',
  'auth.stats': 'logStatsAccess',
  'auth.delete-user': 'logAccountDeleted',
  'data.import': 'logImport',
  'data.export': 'logExport',
  'gallery.create': 'logGalleryAdded',
  'gallery.update': 'logGalleryEdited',
  'gallery.delete': 'logGalleryDeleted',
  'request.create': 'logRequestSent',
  'request.approve': 'logRequestApproved',
  'request.reject': 'logRequestRejected',
  'log.restore': 'logRestoreAction'
};

const FIELDS = {
  firstName: 'logFieldFirstName',
  lastName: 'logFieldLastName',
  birthDate: 'logFieldBirthDate',
  deathDate: 'logFieldDeathDate',
  gender: 'logFieldGender',
  description: 'logFieldDescription',
  photo: 'logFieldPhoto',
  parents: 'logFieldParents',
  spouses: 'logFieldSpouses',
  formerSpouses: 'logFieldFormerSpouses'
};

const pad = (n) => String(n).padStart(2, '0');
const formatWhen = (value) => {
  const d = new Date(value);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const ActivityLog = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState(''); // the query that is applied (after a short pause)
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    try {
      const res = await auditAPI.list({ page, action, status, q: search });
      setData(res.data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [page, action, status, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRestore = async (entry) => {
    if (!window.confirm(t('logRestoreConfirm'))) return;
    setBusyId(entry.id);
    try {
      const res = await auditAPI.restore(entry.id);
      alert(res.data.note === 'photo' ? t('logPhotoNote') : t('logRestoreDone'));
      await load();
    } catch (error) {
      alert(error.response?.data?.error || t('error'));
    } finally {
      setBusyId(null);
    }
  };

  const actionLabel = (code) => t(ACTIONS[code] || 'logAction', code);

  return (
    <div className="activity-log">
      <Link to="/admin" className="log-back">← {t('adminPanel')}</Link>
      <h1>{t('logTitle')}</h1>

      <div className="log-filters">
        <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          <option value="">{t('logAllActions')}</option>
          {Object.keys(ACTIONS).map((code) => (
            <option key={code} value={code}>{actionLabel(code)}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">{t('logAllStatus')}</option>
          <option value="success">{t('logSuccess')}</option>
          <option value="fail">{t('logFail')}</option>
        </select>
        <input
          type="search"
          value={query}
          placeholder={t('logSearch')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {failed && <div className="no-data">{t('error')}</div>}
      {!data && !failed && <div className="loading">{t('loading')}</div>}

      {data && data.entries.length === 0 && <div className="no-data">{t('logNone')}</div>}

      {data && data.entries.length > 0 && (
        <ul className="log-list">
          {data.entries.map((e) => (
            <li key={e.id} className={`log-entry log-${e.status}`}>
              <div className="log-main">
                <span className="log-when">{formatWhen(e.createdAt)}</span>
                <span className={`log-status log-status-${e.status}`}>
                  {e.status === 'success' ? t('logSuccess') : t('logFail')}
                </span>
                <strong className="log-action">{actionLabel(e.action)}</strong>
                {e.targetName && <span className="log-target">{e.targetName}</span>}
              </div>
              <div className="log-who">
                {e.username || '—'}
                {e.role ? ` (${e.role})` : ''}
                {e.ip ? ` · ${e.ip}` : ''}
                {e.message ? ` · ${e.message}` : ''}
              </div>
              {e.changes.length > 0 && (
                <ul className="log-changes">
                  {e.changes.map((c) => (
                    <li key={c.field}>
                      <span className="log-field">{t(FIELDS[c.field] || c.field)}</span>{' '}
                      <span className="log-from">{c.from || '—'}</span> → <span className="log-to">{c.to || '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
              {e.restoredAt ? (
                <div className="log-restored">{t('logRestored', { name: e.restoredBy })} · {formatWhen(e.restoredAt)}</div>
              ) : (
                e.canRestore && (
                  <button
                    type="button"
                    className="btn-secondary log-restore"
                    disabled={busyId === e.id}
                    onClick={() => handleRestore(e)}
                  >
                    {t('logRestore')}
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      {data && data.pages > 1 && (
        <div className="log-pager">
          <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {t('logPrev')}
          </button>
          <span>{t('logPage', { page: data.page, pages: data.pages })}</span>
          <button type="button" className="btn-secondary" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
            {t('logNext')}
          </button>
        </div>
      )}
    </div>
  );
};

export default ActivityLog;
