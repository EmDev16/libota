import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
export const IMAGE_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A wrong password at login is also a 401: stay on the page so the message can be shown
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (username, password, language) =>
    api.post('/auth/login', { username, password, language }),
  register: (username, password, role, language) =>
    api.post('/auth/register', { username, password, role, language }),
  getMe: () => api.get('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    api.put('/auth/password', { currentPassword, newPassword }),
  resetUserPassword: (id, newPassword) =>
    api.put(`/auth/users/${id}/password`, { newPassword }),
  getUsers: () => api.get('/auth/users'),
  deleteUser: (id) => api.delete(`/auth/users/${id}`)
};

export const personAPI = {
  getAll: () => api.get('/person'),
  getById: (id) => api.get(`/person/${id}`),
  create: (formData) => api.post('/person', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  update: (id, formData) => api.put(`/person/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  delete: (id) => api.delete(`/person/${id}`)
};

export const treeAPI = {
  getComplete: () => api.get('/tree/complete'),
  getFromPerson: (id) => api.get(`/tree/from/${id}`),
  getRelationship: (id1, id2) => api.get(`/tree/relationship/${id1}/${id2}`),
  filterByRelationship: (type, rootId) => api.get(`/tree/filter/${type}`, { params: { rootId } })
};

export const exportAPI = {
  exportJSON: () => api.get('/export/json'),
     importJSON: (data, mode = 'add') => api.post('/export/json', { data, mode })
};

export default api;
