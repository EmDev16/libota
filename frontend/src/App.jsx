import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import FamilyTree from './pages/FamilyTree';
import PersonList from './pages/PersonList';
import PersonForm from './pages/PersonForm';
import RelationshipFinder from './pages/RelationshipFinder';
import AdminPanel from './pages/AdminPanel';
import Account from './pages/Account';
import Navbar from './components/Navbar';

const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return <div className="loading">{user ? 'Loading...' : 'Loading...'}</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" />;
  }

  return children;
};

const AppContent = () => {
  const { t } = useTranslation();

  return (
    <Router>
      <div className="app">
        <Navbar />
        <main className="main-content">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tree"
              element={
                <ProtectedRoute>
                  <FamilyTree />
                </ProtectedRoute>
              }
            />
            <Route
              path="/people"
              element={
                <ProtectedRoute>
                  <PersonList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/people/new"
              element={
                <ProtectedRoute>
                  <PersonForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/people/:id/edit"
              element={
                <ProtectedRoute>
                  <PersonForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/relationship"
              element={
                <ProtectedRoute>
                  <RelationshipFinder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/account"
              element={
                <ProtectedRoute>
                  <Account />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute adminOnly>
                  <AdminPanel />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
