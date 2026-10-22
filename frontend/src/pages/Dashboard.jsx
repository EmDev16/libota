import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="dashboard">
      <h1>{t('welcome')}, {user?.username}!</h1>
      <div className="dashboard-cards">
        <div className="dashboard-card" onClick={() => navigate('/tree')}>
          <h2>{t('familyTree')}</h2>
          <p>{t('viewTree')}</p>
        </div>
        <div className="dashboard-card" onClick={() => navigate('/people')}>
          <h2>{t('allPeople')}</h2>
          <p>{t('viewList')}</p>
        </div>
        {isAdmin && (
          <div className="dashboard-card" onClick={() => navigate('/people/new')}>
            <h2>{t('addPerson')}</h2>
            <p>{t('createSuccess')}</p>
          </div>
        )}
        <div className="dashboard-card" onClick={() => navigate('/relationship')}>
          <h2>{t('relationshipFinder')}</h2>
          <p>{t('findRelationship')}</p>
        </div>
        {isAdmin && (
          <div className="dashboard-card admin-card" onClick={() => navigate('/admin')}>
            <h2>{t('adminPanel')}</h2>
            <p>{t('manageUsers')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;