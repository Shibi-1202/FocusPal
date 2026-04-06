const config = require('./supabaseConfig');

class SupabaseRequestError extends Error {
  constructor(message, status, payload = null) {
    super(message);
    this.name = 'SupabaseRequestError';
    this.status = status;
    this.payload = payload;
  }
}

function parseJsonSafe(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  if (typeof payload.error_description === 'string') return payload.error_description;
  if (typeof payload.msg === 'string') return payload.msg;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.error === 'string') return payload.error;
  return fallback;
}

class SupabaseClient {
  constructor(options = {}) {
    this.url = options.url || config.url;
    this.anonKey = options.anonKey || config.anonKey;
    this.passwordResetRedirectURL = options.passwordResetRedirectURL || config.passwordResetRedirectURL || '';
    this.accessToken = null;
    this.refreshToken = null;
  }

  isConfigured() {
    return Boolean(this.url && this.anonKey);
  }

  getConfigError() {
    if (this.isConfigured()) {
      return null;
    }

    return 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY before using the app.';
  }

  setSession(accessToken, refreshToken) {
    this.accessToken = accessToken || null;
    this.refreshToken = refreshToken || null;
  }

  clearSession() {
    this.accessToken = null;
    this.refreshToken = null;
  }

  getSession() {
    return {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken
    };
  }

  async request(path, options = {}) {
    if (!this.isConfigured()) {
      throw new SupabaseRequestError(this.getConfigError(), 500);
    }

    const {
      method = 'GET',
      body,
      headers = {},
      useSession = false,
      allowRefresh = true
    } = options;

    const requestHeaders = {
      apikey: this.anonKey,
      ...headers
    };

    if (body !== undefined && !requestHeaders['Content-Type']) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    if (useSession) {
      if (!this.accessToken) {
        throw new SupabaseRequestError('You must be signed in to perform this action.', 401);
      }

      requestHeaders.Authorization = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${this.url}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const rawText = await response.text();
    const payload = parseJsonSafe(rawText) ?? rawText ?? null;

    if (response.status === 401 && useSession && allowRefresh && this.refreshToken) {
      await this.refreshAuthSession();
      return this.request(path, { ...options, allowRefresh: false });
    }

    if (!response.ok) {
      throw new SupabaseRequestError(
        extractErrorMessage(payload, `Supabase request failed with status ${response.status}`),
        response.status,
        payload
      );
    }

    return payload;
  }

  async signUp({ email, password, displayName }) {
    return this.request('/auth/v1/signup', {
      method: 'POST',
      body: {
        email,
        password,
        data: {
          display_name: displayName
        }
      }
    });
  }

  async signInWithPassword({ email, password }) {
    return this.request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email, password }
    });
  }

  async refreshAuthSession() {
    if (!this.refreshToken) {
      throw new SupabaseRequestError('No refresh token available.', 401);
    }

    const session = await this.request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: {
        refresh_token: this.refreshToken
      },
      allowRefresh: false
    });

    this.setSession(session?.access_token, session?.refresh_token || this.refreshToken);
    return session;
  }

  async getUser() {
    return this.request('/auth/v1/user', {
      useSession: true
    });
  }

  async signOut() {
    if (!this.accessToken) {
      return null;
    }

    try {
      return await this.request('/auth/v1/logout', {
        method: 'POST',
        useSession: true,
        allowRefresh: false
      });
    } finally {
      this.clearSession();
    }
  }

  async requestPasswordReset(email) {
    const body = { email };
    if (this.passwordResetRedirectURL) {
      body.redirect_to = this.passwordResetRedirectURL;
    }

    return this.request('/auth/v1/recover', {
      method: 'POST',
      body
    });
  }

  async getAppState(userId) {
    const query = new URLSearchParams({
      user_id: `eq.${userId}`,
      select: 'data,updated_at'
    });

    const result = await this.request(`/rest/v1/app_state?${query.toString()}`, {
      useSession: true
    });

    return Array.isArray(result) ? result[0] || null : result;
  }

  async upsertAppState(userId, data) {
    const result = await this.request('/rest/v1/app_state', {
      method: 'POST',
      useSession: true,
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: {
        user_id: userId,
        data,
        updated_at: new Date().toISOString()
      }
    });

    return Array.isArray(result) ? result[0] || null : result;
  }
}

module.exports = {
  SupabaseClient,
  SupabaseRequestError
};
