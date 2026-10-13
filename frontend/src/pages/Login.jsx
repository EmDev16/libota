import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState('fr');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(username, password, language);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || t('loginFailed'));
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
          <button type="submit" className="btn-primary">
            {t('loginButton')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
