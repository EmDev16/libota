import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../utils/dates';
import { photoUrl } from '../utils/photo';

const FIELD_LABELS = {
  firstName: 'firstName',
  lastName: 'lastName',
  birthDate: 'birthDate',
  deathDate: 'deathDate',
  gender: 'gender',
  description: 'description'
};

// One suggestion, read-only: what was asked, with a photo if there is one. Admin buttons go in `children`.
const SuggestionItem = ({ item }) => {
  const { t } = useTranslation();
  const data = item.type === 'correction' ? item.changes || {} : item.type === 'photo' ? {} : item.newPerson || {};
  const g = item.type === 'photo' ? item.gallery || {} : null;
  const show = (field, value) => {
    if (field.endsWith('Date')) return formatDate(value);
    if (field === 'gender') return t(value, value);
    return value;
  };

  // what the person has now (waiting) or had before (answered), to compare with
  const old = item.current || item.previous || null;

  const title =
    item.type === 'correction'
      ? t('suggestFor', { name: item.personName, defaultValue: 'Change for {{name}}' })
      : item.type === 'photo'
        ? t('suggestTypePhoto')
        : item.type === 'me'
        ? t('suggestTypeMe')
        : t('suggestTypeNew');

  return (
    <div className="request-item">
      <strong>{title}</strong>
      <dl className="request-fields">
        {Object.keys(FIELD_LABELS)
          .filter((f) => data[f])
          .map((f) => (
            <React.Fragment key={f}>
              <dt>{t(FIELD_LABELS[f])}</dt>
              <dd>
                {item.type === 'correction' && old && (
                  <>
                    <span className="request-old">{show(f, old[f]) || '—'}</span>
                    <span className="request-arrow"> → </span>
                  </>
                )}
                <span className="request-new">{show(f, data[f])}</span>
              </dd>
            </React.Fragment>
          ))}
        {g && g.caption && (
          <>
            <dt>{t('galleryCaption')}</dt>
            <dd>{g.caption}</dd>
          </>
        )}
        {g && (g.takenDate || g.takenYear) && (
          <>
            <dt>{t('galleryYear')}</dt>
            <dd>{g.takenDate ? formatDate(g.takenDate) : g.takenYear}</dd>
          </>
        )}
        {g && g.album && (
          <>
            <dt>{t('galleryAlbum')}</dt>
            <dd>{g.album}</dd>
          </>
        )}
        {g && g.tags && g.tags.length > 0 && (
          <>
            <dt>{t('galleryTags')}</dt>
            <dd>{g.tags.map((x) => `#${x}`).join(' ')}</dd>
          </>
        )}
        {item.relation && (
          <>
            <dt>{t('suggestRelation')}</dt>
            <dd>{item.relation}</dd>
          </>
        )}
        {item.note && (
          <>
            <dt>{t('suggestNote')}</dt>
            <dd>{item.note}</dd>
          </>
        )}
      </dl>
      {item.photo && (
        <div className="request-photos">
          {old && old.photo && (
            <figure>
              <img className="request-photo" src={photoUrl(old.photo)} alt="" />
              <figcaption>{t('suggestPhotoCurrent')}</figcaption>
            </figure>
          )}
          <figure>
            <img className="request-photo" src={photoUrl(item.photo)} alt="" />
            {old && old.photo && <figcaption>{t('suggestPhotoNew')}</figcaption>}
          </figure>
        </div>
      )}
    </div>
  );
};

export default SuggestionItem;
