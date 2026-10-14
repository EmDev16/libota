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

  // Helper function to convert relationship type to readable text
  const getRelationshipText = (relationType, fromPerson, toPerson) => {
    if (!relationType) return '';
    
    const fromGender = fromPerson?.gender || 'other';
    const toGender = toPerson?.gender || 'other';
    
    switch (relationType) {
      case 'parent':
        if (toGender === 'male') return t('father');
        if (toGender === 'female') return t('mother');
        return t('parent');
      case 'child':
        if (toGender === 'male') return t('son');
        if (toGender === 'female') return t('daughter');
        return t('child');
      case 'spouse':
        if (toGender === 'male') return t('husband');
        if (toGender === 'female') return t('wife');
        return t('spouse');
      default:
        return relationType;
    }
  };

  // Helper function to create relationship description like "X is Y's mother"
  const getRelationshipDescription = (relationType, fromPerson, toPerson) => {
    if (!relationType || !fromPerson || !toPerson) return '';
    
    const fromName = `${fromPerson.firstName} ${fromPerson.lastName}`;
    const toName = `${toPerson.firstName} ${toPerson.lastName}`;
    const toGender = toPerson?.gender || 'other';
    const fromGender = fromPerson?.gender || 'other';
    
    switch (relationType) {
      case 'parent':
        if (toGender === 'male') return `${toName} is ${fromName}'s ${t('father')}`;
        if (toGender === 'female') return `${toName} is ${fromName}'s ${t('mother')}`;
        return `${toName} is ${fromName}'s ${t('parent')}`;
      case 'child':
        if (toGender === 'male') return `${toName} is ${fromName}'s ${t('son')}`;
        if (toGender === 'female') return `${toName} is ${fromName}'s ${t('daughter')}`;
        return `${toName} is ${fromName}'s ${t('child')}`;
      case 'spouse':
        if (toGender === 'male') return `${toName} is ${fromName}'s ${t('husband')}`;
        if (toGender === 'female') return `${toName} is ${fromName}'s ${t('wife')}`;
        return `${toName} is ${fromName}'s ${t('spouse')}`;
      case 'sibling':
        if (toGender === 'male' && fromGender === 'male') return `${toName} is ${fromName}'s ${t('brother')}`;
        if (toGender === 'female' && fromGender === 'female') return `${toName} is ${fromName}'s ${t('sister')}`;
        if (toGender === 'male') return `${toName} is ${fromName}'s ${t('brother')}`;
        if (toGender === 'female') return `${toName} is ${fromName}'s ${t('sister')}`;
        return `${toName} is ${fromName}'s ${t('sibling')}`;
      default:
        return '';
    }
  };

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
          {(() => {
            const mutual = (result.mutualKey && t(result.mutualKey) !== result.mutualKey)
              ? t(result.mutualKey)
              : (result.mutualRelationship || '');

            const title = (result.relationshipKey && t(result.relationshipKey) !== result.relationshipKey)
              ? t(result.relationshipKey)
              : (result.relationship || '');

            const desc = result.description || (
              result.path && result.path.length === 2 && title
                ? `${result.path[1].firstName} is ${result.path[0].firstName}'s ${title}`
                : ''
            );

            return (
              <>
                {mutual && (
                  <div className="relationship-badge">{mutual}</div>
                )}
                {title && (
                  <h2 className="relationship-title">{title}</h2>
                )}
                {desc && (
                  <p className="relationship-desc">{desc}</p>
                )}
              </>
            );
          })()}

          {result.path && result.path.length > 0 && (
            <div className="relationship-path">
              <h3>{t('path')}:</h3>
              {result.description && (
                <p className="relationship-summary">{result.description}</p>
              )}
              <div className="path-breadcrumbs">
                {result.path.map((person, index) => {
                  const prevPerson = result.path[index - 1];
                  const nextPerson = result.path[index + 1];
                  
                  // Get relationship to previous person - use backend's relationToPrevious
                  const relationToPrev = person.relationToPrevious
                    ? getRelationshipDescription(
                        person.relationToPrevious, 
                        prevPerson, 
                        person
                      )
                    : '';
                  
                  // Get relationship to next person - use backend's relationToNext
                  const relationToNext = person.relationToNext && nextPerson
                    ? getRelationshipDescription(
                        person.relationToNext,
                        person,
                        nextPerson
                      )
                    : '';
                  
                  return (
                    <React.Fragment key={person._id || index}>
                      {index > 0 && relationToPrev && (
                        <div className="path-step-connector">
                          <span className="arrow-icon">→</span>
                          <span className="step-relation">{relationToPrev}</span>
                        </div>
                      )}
                      {index > 0 && !relationToPrev && (
                        <div className="path-step-connector">
                          <span className="arrow-icon">→</span>
                        </div>
                      )}
                      <div className={`path-card ${index === 0 ? 'start' : index === result.path.length - 1 ? 'end' : ''}`}>
                        <span className="path-name">{person.firstName} {person.lastName}</span>
                        {relationToNext && index < result.path.length - 1 && (
                          <span className="next-relation">{relationToNext}</span>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RelationshipFinder;
