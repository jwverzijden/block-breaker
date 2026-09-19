/*
 * localStorage persistence: game save + small settings (mute).
 * Safe against disabled/private storage.
 */
(function () {
  'use strict';

  const SAVE_KEY = 'blockbreaker_save_v1';
  const SETTINGS_KEY = 'blockbreaker_settings_v1';

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  window.GameStorage = {
    save(data) {
      data.savedAt = Date.now();
      return safeSet(SAVE_KEY, JSON.stringify(data));
    },
    load() {
      const raw = safeGet(SAVE_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    },
    hasSave() {
      return !!safeGet(SAVE_KEY);
    },
    clear() {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    },
    settings() {
      const raw = safeGet(SETTINGS_KEY);
      if (!raw) return { muted: false };
      try { return Object.assign({ muted: false }, JSON.parse(raw)); }
      catch (e) { return { muted: false }; }
    },
    saveSettings(s) {
      return safeSet(SETTINGS_KEY, JSON.stringify(s));
    }
  };
})();
