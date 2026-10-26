import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

// What a member can do on the site, one short step at a time. Each step can take you to that page.
const STEPS = [
  { key: 'Tree', to: '/tree' },
  { key: 'People', to: '/people' },
  { key: 'Rel', to: '/relationship' },
  { key: 'Gallery', to: '/gallery' },
  { key: 'Suggest', to: '/suggest' },
  { key: 'Lang', to: null }
];

const Guide = ({ onHide }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section className="guide" id="guide">
      <h2>{t('guideTitle')}</h2>
      <p className="guide-intro">{t('guideIntro')}</p>
      <ol className="guide-steps">
        {STEPS.map((step) => (
          <li key={step.key} className="guide-step">
            <div className="guide-step-text">
              <strong>{t(`guide${step.key}Title`)}</strong>
              <span>{t(`guide${step.key}Text`)}</span>
            </div>
            {step.to && (
              <button type="button" className="btn-secondary" onClick={() => navigate(step.to)}>
                {t('guideOpen')}
              </button>
            )}
          </li>
        ))}
      </ol>
      <div className="guide-footer">
        <button type="button" className="btn-primary" onClick={onHide}>
          {t('guideHide')}
        </button>
        <small>{t('guideHideNote')}</small>
      </div>
    </section>
  );
};

export default Guide;
