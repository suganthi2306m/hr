/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import apiClient, { API_BASE_URL, TOKEN_KEY, setApiBaseUrl } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY));
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setAdmin(null);
  }, []);

  const fetchMe = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setLoading(false);
      return;
    }

    try {
      const { data } = await apiClient.get('/auth/me');
      setAdmin(data.admin);
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe, token]);

  const login = async (email, password) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const devHosts = import.meta.env.DEV
      ? ['http://localhost:9001/api', 'http://localhost:5000/api']
      : [];
    const baseCandidates = Array.from(
      new Set([API_BASE_URL, apiClient.defaults.baseURL, ...devHosts].filter(Boolean)),
    );

    const performLogin = async () => {
      let lastError;
      for (const baseUrl of baseCandidates) {
        try {
          const response = await axios.post(
            `${baseUrl}/auth/login`,
            { email: normalizedEmail, password },
            { timeout: 15000 },
          );
          setApiBaseUrl(baseUrl);
          return response;
        } catch (error) {
          lastError = error;
          if (error.response) {
            throw error;
          }
        }
      }
      throw lastError || new Error('Unable to connect to auth service');
    };

    let response;
    try {
      response = await performLogin();
    } catch (error) {
      const isTransient = !error.response && ['ERR_NETWORK', 'ECONNABORTED'].includes(error.code);
      if (!isTransient) {
        throw error;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 600);
      });
      response = await performLogin();
    }

    const { data } = response;
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setAdmin(data.admin);
    return data;
  };

  const value = useMemo(
    () => ({
      token,
      admin,
      loading,
      login,
      logout,
      refetchProfile: fetchMe,
      setAdmin,
      isAuthenticated: Boolean(token),
    }),
    [admin, fetchMe, loading, logout, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
