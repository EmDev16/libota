import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState('fr');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false); // the server is probably asleep and starting up
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // The free server sleeps when nobody used it for 15 minutes; waking up takes up to a minute.
  // After a few seconds of waiting, say so instead of leaving a silent button.
  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return undefined;
    }
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [busy]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username, password, language);
      navigate('/dashboard');
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        setError(t('tooManyAttempts', 'Too many attempts. Please wait a few minutes and try again.'));
      } else if (!err.response) {
        setError(t('serverUnreachable', 'Cannot reach the server. It may be waking up: wait a moment and try again.'));
      } else {
        // The same general message for a wrong password and an unknown user
        setError(t('loginFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>{t('appName')}</h1>
        <p>{t('familyTreeDescription')}</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('language')}</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="ln">Lingala</option>
              <option value="nl">Nederlands</option>
            </select>
          </div>
          <div className="form-group">
            <label>{t('username')}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>{t('password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="error">{error}</div>}
          {slow && (
            <div className="wake-note" role="status">
              {t('serverWaking', 'The server is waking up after a quiet period. This can take up to a minute, please wait…')}
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t('loading') : t('loginButton')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
