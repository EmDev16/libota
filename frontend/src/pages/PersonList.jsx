import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { personAPI } from '../api';
import { photoUrl } from '../utils/photo';
import { useAuth } from '../contexts/AuthContext';
import { formatDate } from '../utils/dates';
import { useDialog } from '../components/DialogProvider';

const PersonList = () => {
  const { t } = useTranslation();
  const dialog = useDialog();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  useEffect(() => {
    loadPeople();
  }, []);

  const loadPeople = async () => {
    try {
      const response = await personAPI.getAll();
      setPeople(response.data);
    } catch (error) {
      console.error('Error loading people:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!isAdmin) {
      await dialog.alert(t('memberCannotDelete'));
      return;
    }
    if (await dialog.confirm(t('confirmDelete'), { danger: true })) {
      try {
        await personAPI.delete(id);
        loadPeople();
      } catch (error) {
        console.error('Error deleting person:', error);
      }
    }
  };

  const filteredPeople = people.filter(person =>
    `${person.firstName} ${person.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="loading">{t('loading')}</div>;
  }

  return (
    <div className="person-list">
      <div className="list-header">
        <h1>{t('allPeople')}</h1>
        {isAdmin && (
          <button
            className="btn-primary"
            onClick={() => navigate('/people/new')}
          >
            {t('addPerson')}
          </button>
        )}
      </div>
      <input
        type="text"
        placeholder={t('searchPlaceholder')}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="search-input"
      />
      <div className="people-grid">
        {filteredPeople.length === 0 ? (
          <div className="no-data">{t('noData')}</div>
        ) : (
          filteredPeople.map((person) => (
            <div key={person._id} className="person-card-item">
              {person.photo && (
                <img
                  src={photoUrl(person.photo)}
                  alt={person.fullName}
                  className="person-photo-small"
                />
              )}
              <div className="person-details">
                <h3>{person.firstName} {person.lastName}</h3>
                <p>{formatDate(person.birthDate)}</p>
              </div>
              {isAdmin && (
                <div className="person-actions">
                  <button
                    onClick={() => navigate(`/people/${person._id}/edit`)}
                    className="btn-secondary"
                  >
                    {t('edit')}
                  </button>
                  <button
                    onClick={() => handleDelete(person._id)}
                    className="btn-danger"
                  >
                    {t('delete')}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PersonList;