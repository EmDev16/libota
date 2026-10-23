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
  const data = item.type === 'correction' ? item.changes || {} : item.newPerson || {};
  const show = (field, value) => {
    if (field.endsWith('Date')) return formatDate(value);
    if (field === 'gender') return t(value, value);
    return value;
  };

  const title =
    item.type === 'correction'
      ? t('suggestFor', { name: item.personName, defaultValue: 'Change for {{name}}' })
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
              <dd>{show(f, data[f])}</dd>
            </React.Fragment>
          ))}
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
      {item.photo && <img className="request-photo" src={photoUrl(item.photo)} alt="" />}
    </div>
  );
};

export default SuggestionItem;
