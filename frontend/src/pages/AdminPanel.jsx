import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { authAPI, exportAPI } from '../api';

const AdminPanel = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'member',
    language: 'en'
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await authAPI.getUsers();
      setUsers(response.data);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await authAPI.register(
        newUser.username,
        newUser.password,
        newUser.role,
        newUser.language
      );
      setShowAddUser(false);
      setNewUser({ username: '', password: '', role: 'member', language: 'en' });
      loadUsers();
    } catch (error) {
      console.error('Error adding user:', error);
      alert(t('error'));
    }
  };

  const handleDeleteUser = async (id) => {
    if (window.confirm(t('confirmDelete'))) {
      try {
        await authAPI.deleteUser(id);
        loadUsers();
      } catch (error) {
        console.error('Error deleting user:', error);
      }
    }
  };

  const handleExportJSON = async () => {
    try {
      const response = await exportAPI.exportJSON();
      const dataStr = JSON.stringify(response.data, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `libota-backup-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
    } catch (error) {
      console.error('Error exporting:', error);
    }
  };

  if (loading) {
    return <div className="loading">{t('loading')}</div>;
  }

  return (
    <div className="admin-panel">
      <h1>{t('adminPanel')}</h1>

      <div className="admin-section">
        <h2>{t('users')}</h2>
        <button
          className="btn-primary"
          onClick={() => setShowAddUser(!showAddUser)}
        >
          {t('addUser')}
        </button>

        {showAddUser && (
          <form onSubmit={handleAddUser} className="add-user-form">
            <div className="form-group">
              <label>{t('username')}</label>
              <input
                type="text"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>{t('password')}</label>
              <input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>{t('role')}</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              >
                <option value="member">{t('member')}</option>
                <option value="admin">{t('admin')}</option>
              </select>
            </div>
            <div className="form-group">
              <label>{t('language')}</label>
              <select
                value={newUser.language}
                onChange={(e) => setNewUser({ ...newUser, language: e.target.value })}
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="ln">Lingala</option>
                <option value="nl">Nederlands</option>
              </select>
            </div>
            <button type="submit" className="btn-primary">
              {t('save')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowAddUser(false)}
            >
              {t('cancel')}
            </button>
          </form>
        )}

        <div className="users-list">
          {users.map(user => (
            <div key={user._id} className="user-item">
              <div className="user-info">
                <strong>{user.username}</strong>
                <span className={`role-badge ${user.role}`}>{user.role}</span>
                <span className="language-badge">{user.language}</span>
              </div>
              <button
                onClick={() => handleDeleteUser(user._id)}
                className="btn-danger"
              >
                {t('delete')}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-section">
        <h2>{t('dataBackup')}</h2>
        <button onClick={handleExportJSON} className="btn-primary">
          {t('exportJSON')}
        </button>
      </div>
    </div>
  );
};

export default AdminPanel;
