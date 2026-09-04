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

  // White-label branding: apply accent colors, favicon and document title from
  // /api/app/settings so the marketing site reflects admin/env configuration.
  const applyBranding = (payload) => {
    try {
      const branding = payload?.public_settings?.branding || {};
      const business = payload?.public_settings?.business || {};
      const root = document.documentElement;
      if (branding.accentColor) {
        root.style.setProperty('--brand-accent', branding.accentColor);
        root.style.setProperty('--brand-accent-hover', branding.accentHoverColor || branding.accentColor);
      }
      if (branding.faviconUrl) {
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = branding.faviconUrl;
      }
      if (business.name) {
        document.title = business.tagLine
          ? `${business.name} — ${business.tagLine}`
          : business.name;
      }
    } catch (e) {
      // Branding is cosmetic; never block boot on it.
      console.error('Branding apply failed:', e);
    }
  };

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
        const payload = await res.json();
        setAppPublicSettings(payload);
        applyBranding(payload);
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

  // Re-fetch public settings (used after white-label changes in /admin so the
  // marketing chrome and branding vars update without a full page reload).
  const refreshAppSettings = async () => {
    try {
      const res = await fetch('/api/app/settings');
      if (res.ok) {
        const payload = await res.json();
        setAppPublicSettings(payload);
        applyBranding(payload);
      }
    } catch (e) {
      console.error('App settings refresh failed:', e);
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

  // Self-service profile updates: merges the fresh public user into state so
  // every consumer (header chip, role gates) reflects the change immediately.
  const updateProfile = async (patch) => {
    const updated = await base44.auth.updateProfile(patch);
    if (updated) setUser(updated);
    return updated;
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
      updateProfile,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
      refreshAppSettings
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
