import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { requestAPI } from '../api';
import SuggestionItem from '../components/SuggestionItem';
import SuggestionTabs from '../components/SuggestionTabs';

const pad = (n) => String(n).padStart(2, '0');
const formatWhen = (value) => {
  const d = new Date(value);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const STATUS = { pending: 'statusPending', approved: 'statusApproved', rejected: 'statusRejected' };

const MyRequests = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [requests, setRequests] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    requestAPI.mine().then((res) => setRequests(res.data)).catch(() => setFailed(true));
  }, []);

  if (failed) return <div className="no-data">{t('error')}</div>;
  if (!requests) return <div className="loading">{t('loading')}</div>;

  return (
    <div className="activity-log">
      <SuggestionTabs current="mine" />
      <h1>{t('myRequestsTitle')}</h1>
      {location.state?.sent && <div className="import-success">{t('suggestSent')}</div>}

      {requests.length === 0 && <div className="no-data">{t('myRequestsNone')}</div>}

      <ul className="log-list">
        {requests.map((r) => (
          <li key={r._id} className="log-entry">
            <div className="log-main">
              <span className="log-when">{formatWhen(r.createdAt)}</span>
              <strong>{r.senderName}</strong>
            </div>
            {r.items.map((item) => (
              <div key={item._id}>
                <SuggestionItem item={item} />
                <div className="request-status">
                  <span className={`log-status log-status-${item.status === 'rejected' ? 'fail' : item.status === 'pending' ? 'pending' : 'success'}`}>
                    {t(STATUS[item.status])}
                  </span>
                  {item.status === 'rejected' && item.rejectReason && (
                    <span>{t('requestReason', { reason: item.rejectReason, defaultValue: 'Reason: {{reason}}' })}</span>
                  )}
                </div>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default MyRequests;
