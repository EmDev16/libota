import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authAPI, exportAPI, requestAPI } from '../api';
import { LANGUAGES } from '../i18n';

// Accepts a plain array of people, or an object like { people: [...] }
const extractPeople = (parsed) => {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    for (const key of ['people', 'persons', 'data']) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }
  }
  return null;
};

const AdminPanel = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'member',
    language: 'en',
    showStats: false
  });

  // Import state
  const fileInputRef = useRef(null);
  const [importMode, setImportMode] = useState('add');
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState(null); // { type: 'success' | 'error', text }

  useEffect(() => {
    loadUsers();
    requestAPI.count().then((res) => setPendingRequests(res.data.pending)).catch(() => {});
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
        newUser.language,
        newUser.showStats
      );
      setShowAddUser(false);
      setNewUser({ username: '', password: '', role: 'member', language: 'en', showStats: false });
      loadUsers();
    } catch (error) {
      console.error('Error adding user:', error);
      // 400 messages are written for people ("Password must be at least 8 characters")
      alert(error.response?.status === 400 ? error.response.data.error : t('error'));
    }
  };

  const handleDeleteUser = async (id) => {
    if (window.confirm(t('confirmDelete'))) {
      try {
        await authAPI.deleteUser(id);
        loadUsers();
      } catch (error) {
        console.error('Error deleting user:', error);
        alert(error.response?.status === 400 ? error.response.data.error : t('error'));
      }
    }
  };

  const handleToggleStats = async (user) => {
    try {
      await authAPI.setUserStats(user._id, !user.showStats);
      loadUsers();
    } catch (error) {
      console.error('Error changing statistics access:', error);
      alert(t('error'));
    }
  };

  const handleResetPassword = async (user) => {
    const newPassword = window.prompt(
      t('resetPasswordPrompt', { name: user.username })
    );
    if (!newPassword) return;
    try {
      await authAPI.resetUserPassword(user._id, newPassword);
      alert(t('passwordResetDone', { name: user.username }));
    } catch (error) {
      console.error('Error resetting password:', error);
      alert(error.response?.status === 400 ? error.response.data.error : t('error'));
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

  const handleImportFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // lets the same file be chosen again later
    if (!file) return;

    setImportStatus(null);

    // 1. Read and check the file
    let people;
    let data;
    try {
      const parsed = JSON.parse(await file.text());
      people = extractPeople(parsed);
      // keep the rest of a full backup (users...) next to the people list
      data = { ...(Array.isArray(parsed) ? {} : parsed), people };
    } catch (error) {
      setImportStatus({
        type: 'error',
        text: t('importBadJson', 'This file is not valid JSON.')
      });
      return;
    }

    if (!people || people.length === 0) {
      setImportStatus({
        type: 'error',
        text: t('importNoPeople', 'This file does not contain a list of people.')
      });
      return;
    }

    // 2. Ask for confirmation
    const n = people.length;
    if (importMode === 'replace') {
      const ok =
        window.confirm(
          t('importConfirmReplace', {
            n,
            defaultValue:
              'This will DELETE all existing people and replace them with the {{n}} people in this file. Continue?'
          })
        ) &&
        window.confirm(
          t('importConfirmReplaceAgain', 'Are you sure? Export a backup first if you want to keep the current data.')
        );
      if (!ok) return;
    } else if (
      !window.confirm(
        t('importConfirmAdd', {
          n,
          defaultValue: 'Add {{n}} people to the existing data?'
        })
      )
    ) {
      return;
    }

    // 3. Send it to the backend
    setImporting(true);
    try {
      const response = await exportAPI.importJSON(data, importMode);
      setImportStatus({
        type: 'success',
        text: t('importDone', {
          n: response.data.imported,
          defaultValue: 'Imported {{n}} people.'
        })
      });
    } catch (error) {
      console.error('Error importing:', error);
      setImportStatus({
        type: 'error',
        text:
          (error.response && error.response.data && (error.response.data.error || error.response.data.message)) ||
          error.message ||
          t('error')
      });
    } finally {
      setImporting(false);
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
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            {newUser.role === 'member' && (
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newUser.showStats}
                    onChange={(e) => setNewUser({ ...newUser, showStats: e.target.checked })}
                  />
                  {t('showStatsOption', 'Show family statistics on the dashboard')}
                </label>
              </div>
            )}
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
                {user.role === 'member' && (
                  <label className="checkbox-label stats-toggle">
                    <input
                      type="checkbox"
                      checked={!!user.showStats}
                      onChange={() => handleToggleStats(user)}
                    />
                    {t('statsShort', 'Statistics')}
                  </label>
                )}
              </div>
              <button
                onClick={() => handleResetPassword(user)}
                className="btn-secondary"
              >
                {t('resetPassword', 'Reset password')}
              </button>
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
        <h2>{t('requestsTitle')}</h2>
        <p>
          <span className={`pending-pill${pendingRequests > 0 ? ' pending-pill-active' : ''}`}>
            {t('requestsCount', { n: pendingRequests, defaultValue: '{{n}} waiting' })}
          </span>
        </p>
        <Link to="/admin/requests" className="btn-primary log-link">
          {t('requestsOpen')}
        </Link>
      </div>

      <div className="admin-section">
        <h2>{t('logTitle')}</h2>
        <Link to="/admin/log" className="btn-primary log-link">
          {t('logOpen')}
        </Link>
      </div>

      <div className="admin-section">
        <h2>{t('dataBackup')}</h2>

        <div className="backup-actions">
          <button onClick={handleExportJSON} className="btn-primary">
            {t('exportJSON')}
          </button>

          <select
            value={importMode}
            onChange={(e) => setImportMode(e.target.value)}
            className="import-mode-select"
            disabled={importing}
          >
            <option value="add">{t('importModeAdd', 'Add to existing data')}</option>
            <option value="replace">{t('importModeReplace', 'Replace all existing data')}</option>
          </select>

          <button
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            className="btn-secondary"
            disabled={importing}
          >
            {importing ? t('importing', 'Importing...') : t('importJSON', 'Import JSON')}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
        </div>

        {importStatus && (
          <div className={importStatus.type === 'error' ? 'error' : 'import-success'}>
            {importStatus.text}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;