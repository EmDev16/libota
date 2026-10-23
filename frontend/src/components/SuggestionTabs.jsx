import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// The two member pages side by side: write a suggestion / see what was sent
const SuggestionTabs = ({ current }) => {
  const { t } = useTranslation();
  return (
    <div className="chip-group suggestion-tabs">
      <Link to="/suggest" className={`chip${current === 'new' ? ' chip-active' : ''}`}>
        {t('suggestTitle')}
      </Link>
      <Link to="/my-requests" className={`chip${current === 'mine' ? ' chip-active' : ''}`}>
        {t('myRequestsTitle')}
      </Link>
    </div>
  );
};

export default SuggestionTabs;
