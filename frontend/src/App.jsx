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
import Timeline from './pages/Timeline';
import ActivityLog from './pages/ActivityLog';
import SuggestionForm from './pages/SuggestionForm';
import MyRequests from './pages/MyRequests';
import Requests from './pages/Requests';
import Navbar from './components/Navbar';

const ProtectedRoute = ({ children, adminOnly = false, memberOnly = false }) => {
  const { t } = useTranslation();
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return <div className="loading">{t('loading')}</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" />;
  }

  // Admins change people directly, so suggestions are for members only
  if (memberOnly && isAdmin) {
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
                <ProtectedRoute adminOnly>
                  <PersonForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/people/:id/edit"
              element={
                <ProtectedRoute adminOnly>
                  <PersonForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/timeline"
              element={
                <ProtectedRoute>
                  <Timeline />
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
                <ProtectedRoute adminOnly>
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
            <Route
              path="/admin/log"
              element={
                <ProtectedRoute adminOnly>
                  <ActivityLog />
                </ProtectedRoute>
              }
            />
            <Route
              path="/suggest"
              element={
                <ProtectedRoute memberOnly>
                  <SuggestionForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-requests"
              element={
                <ProtectedRoute memberOnly>
                  <MyRequests />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/requests"
              element={
                <ProtectedRoute adminOnly>
                  <Requests />
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