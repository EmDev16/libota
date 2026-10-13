import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { treeAPI } from '../api';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

const FamilyTree = () => {
  const { t } = useTranslation();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [treeStyle, setTreeStyle] = useState('traditional');

  useEffect(() => {
    loadTree();
  }, []);

  const loadTree = async () => {
    try {
      const response = await treeAPI.getComplete();
      setPeople(response.data);
    } catch (error) {
      console.error('Error loading tree:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">{t('loading')}</div>;
  }

  return (
    <div className="family-tree">
      <div className="tree-controls">
        <select
          value={treeStyle}
          onChange={(e) => setTreeStyle(e.target.value)}
          className="tree-style-select"
        >
          <option value="traditional">{t('traditional')}</option>
          <option value="modern">{t('modern')}</option>
        </select>
      </div>
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={3}
      >
        <TransformComponent>
          <div className="tree-container">
            {people.length === 0 ? (
              <div className="no-data">{t('noData')}</div>
            ) : (
              <div className="tree-nodes">
                {people.map((person) => (
                  <div key={person._id} className="tree-node">
                    <div className="person-card">
                      {person.photo && (
                        <img
                          src={`http://localhost:5000${person.photo}`}
                          alt={person.fullName}
                          className="person-photo"
                        />
                      )}
                      <div className="person-info">
                        <h3>{person.firstName} {person.lastName}</h3>
                        <p>{person.birthDate ? new Date(person.birthDate).toLocaleDateString() : ''}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
};

export default FamilyTree;
