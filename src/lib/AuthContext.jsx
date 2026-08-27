import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44, getToken } from '@/api/client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // { id, public_settings }

  useEffect(() => {
    checkAppState();
  }, []);

  // Locally there is no platform-level gate (auth required / user must be
  // registered), so this just loads app settings, then checks an existing
  // bearer token if one is stored.
  const checkAppState = async () => {
    setAuthError(null);
    setIsLoadingPublicSettings(true);
    try {
      const res = await fetch('/api/app/settings');
      if (res.ok) {
        setAppPublicSettings(await res.json());
      }
    } catch (e) {
      console.error('App settings check failed:', e);
      // Non-blocking: the local API is embedded in the same server; a failure
      // here only means settings are unavailable, not that auth is broken.
    } finally {
      setIsLoadingPublicSettings(false);
    }

    if (getToken()) {
      await checkUserAuth();
    } else {
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);

      if (error.status === 401 || error.status === 403) {
        // Dead/expired token: drop it immediately so the next boot does not
        // probe /me with it again (repeated 401s fed the /login redirect
        // loop reported after server restarts).
        base44.auth.clearToken();
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const logout = async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    base44.auth.logout(shouldRedirect ? window.location.href : undefined);
  };

  const navigateToLogin = () => {
    base44.auth.redirectToLogin(window.location.href);
  };


  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
