import React from 'react';
import { useTranslation } from 'react-i18next';
import TagInput from './TagInput';

// Which photos a member account may see: all of them, or the ones with the hidden tags chosen here
// (photos without any hidden tag are always visible).
const GalleryAccess = ({ galleryAll, galleryTags, options = [], onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="gallery-access">
      <label className="checkbox-label">
        <input type="checkbox" checked={!!galleryAll} onChange={(e) => onChange({ galleryAll: e.target.checked, galleryTags })} />
        {t('galleryAccessAll')}
      </label>
      {!galleryAll && (
        <div className="form-group">
          <label>{t('galleryAccessTags')}</label>
          <TagInput value={galleryTags} options={options} onChange={(tags) => onChange({ galleryAll, galleryTags: tags })} />
          <small>{t('galleryAccessHint')}</small>
        </div>
      )}
    </div>
  );
};

export default GalleryAccess;
