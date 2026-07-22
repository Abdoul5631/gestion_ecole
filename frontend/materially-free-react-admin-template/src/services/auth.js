import api from './api';

const authService = {
  login: async (username, password) => {
    const response = await api.post('/auth/login/', { username, password });
    const { access, refresh, role, username: user, id } = response.data;
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    localStorage.setItem('role', role);
    localStorage.setItem('username', user);
    localStorage.setItem('user_id', id);
    api.defaults.headers.common['Authorization'] = `Bearer ${access}`;
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('user_id');
    delete api.defaults.headers.common['Authorization'];
  },

  isAuthenticated: () => !!localStorage.getItem('access_token'),

  getRole: () => localStorage.getItem('role'),

  getUsername: () => localStorage.getItem('username'),

  getToken: () => localStorage.getItem('access_token'),

  setAuthHeader: () => {
    const token = localStorage.getItem('access_token');
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }
};

export default authService;