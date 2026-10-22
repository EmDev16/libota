import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';

const Account = () => {
  const { t } = useTranslation();
  const { user, replaceToken } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== repeat) {
      setMessage({ type: 'error', text: t('passwordsDiffer', 'The two new passwords are not the same.') });
      return;
    }

    setBusy(true);
    try {
      const response = await authAPI.changePassword(currentPassword, newPassword);
      // Every older login stops working, so keep the fresh token
      replaceToken(response.data.token);
      setCurrentPassword('');
      setNewPassword('');
      setRepeat('');
      setMessage({ type: 'success', text: t('passwordChanged', 'Your password has been changed. Other devices must log in again.') });
    } catch (error) {
      const text = error.response?.status === 400 ? error.response.data.error : t('error');
      setMessage({ type: 'error', text });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="person-form">
      <h1>{t('myAccount', 'My account')}</h1>
      <p>
        {user?.username} ({user?.role})
      </p>

      <h2>{t('changePassword', 'Change password')}</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>{t('currentPassword', 'Current password')}</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="form-group">
          <label>{t('newPassword', 'New password')}</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <small>{t('passwordRules', 'At least 8 characters, with a letter and a number.')}</small>
        </div>
        <div className="form-group">
          <label>{t('repeatPassword', 'Repeat the new password')}</label>
          <input
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        {message && (
          <div
            className={message.type === 'error' ? 'error' : undefined}
            style={message.type === 'success' ? { color: '#27ae60', margin: '0.5rem 0' } : undefined}
          >
            {message.text}
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t('loading') : t('save')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Account;
