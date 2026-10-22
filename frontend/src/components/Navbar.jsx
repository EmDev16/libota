import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

const Navbar = () => {
  const { t } = useTranslation();
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="nav-brand">
        <Link to="/dashboard">{t('appName')}</Link>
      </div>
      <div className="nav-links">
        <Link to="/dashboard">{t('dashboard')}</Link>
        <Link to="/tree">{t('familyTree')}</Link>
        <Link to="/people">{t('allPeople')}</Link>
        <Link to="/relationship">{t('relationshipFinder')}</Link>
        {isAdmin && <Link to="/admin">{t('adminPanel')}</Link>}
      </div>
      <div className="nav-user">
        <Link to="/account">{user?.username}</Link>
        <button onClick={handleLogout} className="btn-logout">
          {t('logout')}
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
