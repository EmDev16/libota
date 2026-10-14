import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { treeAPI, personAPI } from '../api';

const RelationshipFinder = () => {
  const { t } = useTranslation();
  const [people, setPeople] = useState([]);
  const [person1, setPerson1] = useState('');
  const [person2, setPerson2] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPeople();
  }, []);

  const loadPeople = async () => {
    try {
      const response = await personAPI.getAll();
      setPeople(response.data);
    } catch (error) {
      console.error('Error loading people:', error);
    }
  };

  const handleFind = async () => {
    if (!person1 || !person2) {
      alert(t('selectPerson'));
      return;
    }

    setLoading(true);
    try {
      const response = await treeAPI.getRelationship(person1, person2);
      setResult(response.data);
    } catch (error) {
      console.error('Error finding relationship:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relationship-finder">
      <h1>{t('relationshipFinder')}</h1>
      <div className="finder-form">
        <div className="form-group">
          <label>{t('selectPerson1')}</label>
          <select
            value={person1}
            onChange={(e) => setPerson1(e.target.value)}
          >
            <option value="">{t('selectPerson')}</option>
            {people.map(person => (
              <option key={person._id} value={person._id}>
                {person.firstName} {person.lastName}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>{t('selectPerson2')}</label>
          <select
            value={person2}
            onChange={(e) => setPerson2(e.target.value)}
          >
            <option value="">{t('selectPerson')}</option>
            {people.map(person => (
              <option key={person._id} value={person._id}>
                {person.firstName} {person.lastName}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleFind}
          className="btn-primary"
          disabled={loading}
        >
          {loading ? t('loading') : t('findRelationship')}
        </button>
      </div>

      {result && (
        <div className="relationship-result">
          {result.mutualKey && result.mutualKey !== 'none' && (
            <div className="relationship-badge">
              {t(result.mutualKey) !== result.mutualKey ? t(result.mutualKey) : result.mutualRelationship}
            </div>
          )}

          <h2 className="relationship-title">
            {t(result.relationshipKey) !== result.relationshipKey ? t(result.relationshipKey) : result.relationship}
          </h2>

          {result.description && (
            <p className="relationship-desc">{result.description}</p>
          )}

          {result.path && result.path.length > 0 && (
            <div className="relationship-path">
              <h3>{t('path')}:</h3>
              <div className="path-breadcrumbs">
                {result.path.map((person, index) => (
                  <React.Fragment key={person._id || index}>
                    {index > 0 && (
                      <div className="path-step-connector">
                        <span className="step-arrow">➔</span>
                        {person.relationToPrevious && (
                          <span className="step-badge">
                            {t(person.relationToPrevious) !== person.relationToPrevious
                              ? t(person.relationToPrevious)
                              : person.relationToPrevious}
                          </span>
                        )}
                        <span className="step-arrow">➔</span>
                      </div>
                    )}
                    <div className={`path-card ${index === 0 ? 'start' : index === result.path.length - 1 ? 'end' : ''}`}>
                      <span className="path-name">{person.firstName} {person.lastName}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RelationshipFinder;
