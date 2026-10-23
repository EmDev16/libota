import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import SearchBox from './SearchBox';
import { LANGUAGES, setLanguage } from '../i18n';

const Navbar = () => {
  const { t, i18n } = useTranslation();
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false); // phone menu

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
        <Link to="/dashboard">{t('dashboard')}</Link>
        <Link to="/tree">{t('familyTree')}</Link>
        <Link to="/people">{t('allPeople')}</Link>
        <Link to="/timeline">{t('timeline', 'Timeline')}</Link>
        <Link to="/relationship">{t('relationshipFinder')}</Link>
        {isAdmin && <Link to="/admin">{t('adminPanel')}</Link>}
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