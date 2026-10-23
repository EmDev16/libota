import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import SearchBox from './SearchBox';
import { LANGUAGES, setLanguage } from '../i18n';
import { requestAPI } from '../api';

const Navbar = () => {
  const { t, i18n } = useTranslation();
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false); // phone menu
  const [pending, setPending] = useState(0); // suggestions waiting for an admin

  // Admins see how many suggestions are waiting (looked up again whenever they change page)
  useEffect(() => {
    if (!isAdmin) return;
    requestAPI.count().then((res) => setPending(res.data.pending)).catch(() => {});
  }, [isAdmin, location.pathname]);

  // The menu closes by itself after choosing a page
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className={`navbar${open ? ' open' : ''}`}>
      <div className="nav-brand">
        <Link to="/dashboard">{t('appName')}</Link>
      </div>
      <button
        type="button"
        className="nav-toggle"
        aria-label={t('menu', 'Menu')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? '✕' : '☰'}
      </button>
      {user && <SearchBox />}
      <div className="nav-links">
        <Link to="/dashboard">{t('navDashboard')}</Link>
        <Link to="/tree">{t('navTree')}</Link>
        <Link to="/people">{t('navPeople')}</Link>
        <Link to="/timeline">{t('navTimeline')}</Link>
        <Link to="/gallery">{t('navGallery')}</Link>
        <Link to="/relationship">{t('navRelationship')}</Link>
        {!isAdmin && user && <Link to="/suggest">{t('navSuggest')}</Link>}
        {isAdmin && (
          <Link to="/admin">
            {t('navAdmin')}
            {pending > 0 && <span className="nav-badge">{pending}</span>}
          </Link>
        )}
      </div>
      <div className="nav-user">
        <select
          className="lang-select"
          value={i18n.resolvedLanguage || 'en'}
          onChange={(e) => setLanguage(e.target.value)}
          aria-label={t('language')}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        {/* members share an account, so only admins get the account page */}
        {isAdmin ? <Link to="/account">{user?.username}</Link> : <span>{user?.username}</span>}
        <button onClick={handleLogout} className="btn-logout">
          {t('logout')}
        </button>
      </div>
    </nav>
  );
};

export default Navbar;