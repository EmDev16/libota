import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { requestAPI } from '../api';
import SuggestionItem from '../components/SuggestionItem';

const pad = (n) => String(n).padStart(2, '0');
const formatWhen = (value) => {
  const d = new Date(value);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const STATUS = { pending: 'statusPending', approved: 'statusApproved', rejected: 'statusRejected' };

const Requests = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [requests, setRequests] = useState(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await requestAPI.list(showAll ? undefined : 'pending');
      setRequests(res.data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [showAll]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (request, item) => {
    setBusy(item._id);
    try {
      const res = await requestAPI.approve(request._id, item._id);
      // a new person still has to be linked to their family
      if (item.type === 'newPerson' || item.type === 'me') navigate(`/people/${res.data.personId}/edit`);
      else await load();
    } catch (error) {
      alert(error.response?.data?.error || t('error'));
      await load();
    } finally {
      setBusy(null);
    }
  };

  const reject = async (request, item) => {
    const reason = window.prompt(t('requestRejectReason'));
    if (reason === null) return;
    setBusy(item._id);
    try {
      await requestAPI.reject(request._id, item._id, reason);
      await load();
    } catch (error) {
      alert(error.response?.data?.error || t('error'));
    } finally {
      setBusy(null);
    }
  };

  if (failed) return <div className="no-data">{t('error')}</div>;
  if (!requests) return <div className="loading">{t('loading')}</div>;

  return (
    <div className="activity-log">
      <Link to="/admin" className="log-back">← {t('adminPanel')}</Link>
      <h1>{t('requestsTitle')}</h1>

      <div className="chip-group" style={{ marginBottom: '1rem' }}>
        <button type="button" className={`chip${!showAll ? ' chip-active' : ''}`} onClick={() => setShowAll(false)}>
          {t('requestsWaiting')}
        </button>
        <button type="button" className={`chip${showAll ? ' chip-active' : ''}`} onClick={() => setShowAll(true)}>
          {t('requestsAll')}
        </button>
      </div>

      {requests.length === 0 && <div className="no-data">{t('requestsNone')}</div>}

      <ul className="log-list">
        {requests.map((r) => (
          <li key={r._id} className="log-entry">
            <div className="log-main">
              <span className="log-when">{formatWhen(r.createdAt)}</span>
              <strong>{r.senderName}</strong>
              <span className="log-who">{r.account}</span>
            </div>
            {r.items.map((item) => (
              <div key={item._id}>
                <SuggestionItem item={item} />
                {item.status === 'pending' ? (
                  <div className="request-actions">
                    <button type="button" className="btn-primary" disabled={busy === item._id} onClick={() => approve(r, item)}>
                      {item.type === 'newPerson' || item.type === 'me' ? t('requestApproveOpen') : t('requestApprove')}
                    </button>
                    <button type="button" className="btn-secondary" disabled={busy === item._id} onClick={() => reject(r, item)}>
                      {t('requestReject')}
                    </button>
                  </div>
                ) : (
                  <div className="request-status">
                    <span className={`log-status log-status-${item.status === 'rejected' ? 'fail' : item.status === 'pending' ? 'pending' : 'success'}`}>
                      {t(STATUS[item.status])}
                    </span>
                    <span>{item.handledBy}</span>
                    {item.rejectReason && <span>{item.rejectReason}</span>}
                  </div>
                )}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Requests;
