(function (root, factory) {
  const api = factory(root);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.FocusPalRendererUtils = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const DEFAULT_NOTIFICATION_SOUND = 'soft-chime';

  function getNotificationSoundApi() {
    return root?.FocusPalNotificationSound || null;
  }

  function normalizeNotificationSound(value, fallback = DEFAULT_NOTIFICATION_SOUND) {
    const soundApi = getNotificationSoundApi();

    if (typeof soundApi?.normalize === 'function') {
      return soundApi.normalize(value || fallback);
    }

    return value || fallback;
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  return {
    DEFAULT_NOTIFICATION_SOUND,
    normalizeNotificationSound,
    validateEmail
  };
});
