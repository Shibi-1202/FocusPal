(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.FocusPalTheme = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_PRESET = 'focuspal';
  const THEME_KEYS = ['bg', 'bg2', 'bg3', 'accent', 'accent2', 'text', 'muted'];
  const STATIC_COLORS = {
    green: '#34d399',
    amber: '#fbbf24',
    red: '#f87171',
    blue: '#60a5fa',
    priorityCritical: '#d6542c',
    priorityHigh: '#124c81',
    priorityMedium: '#4a6190',
    priorityLow: '#98a8bb',
    priorityInfo: '#eda28a',
    priorityPersonal: '#3c345c'
  };

  const PRESETS = {
    focuspal: {
      label: 'FocusPal Iris',
      colors: {
        bg: '#0e0e10',
        bg2: '#1a1a1f',
        bg3: '#242429',
        accent: '#7c6cfc',
        accent2: '#a78bfa',
        text: '#f1f0ff',
        muted: '#8b8a9e'
      }
    },
    ocean: {
      label: 'Ocean Glass',
      colors: {
        bg: '#08131a',
        bg2: '#0f1f29',
        bg3: '#163242',
        accent: '#2ec5ff',
        accent2: '#87f1ff',
        text: '#effcff',
        muted: '#8cb5c1'
      }
    },
    ember: {
      label: 'Ember Signal',
      colors: {
        bg: '#16100d',
        bg2: '#241915',
        bg3: '#34231d',
        accent: '#ff7a45',
        accent2: '#ffb07d',
        text: '#fff3eb',
        muted: '#c4a094'
      }
    },
    forest: {
      label: 'Forest Night',
      colors: {
        bg: '#0b1511',
        bg2: '#12221a',
        bg3: '#1a3125',
        accent: '#37d67a',
        accent2: '#8bf3b2',
        text: '#eefdf4',
        muted: '#93b4a0'
      }
    },
    rose: {
      label: 'Rose Dusk',
      colors: {
        bg: '#161017',
        bg2: '#231825',
        bg3: '#342336',
        accent: '#ff5f87',
        accent2: '#ff9fb4',
        text: '#fff0f5',
        muted: '#b69aaa'
      }
    }
  };

  function normalizeHex(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();

    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
      const expanded = trimmed.slice(1).split('').map((char) => char + char).join('');
      return `#${expanded.toLowerCase()}`;
    }

    return fallback;
  }

  function hexToRgb(hex) {
    const normalized = normalizeHex(hex, '#000000');
    return {
      r: parseInt(normalized.slice(1, 3), 16),
      g: parseInt(normalized.slice(3, 5), 16),
      b: parseInt(normalized.slice(5, 7), 16)
    };
  }

  function rgbToHex(r, g, b) {
    return `#${[r, g, b].map((value) => {
      const clamped = Math.max(0, Math.min(255, Math.round(value)));
      return clamped.toString(16).padStart(2, '0');
    }).join('')}`;
  }

  function mix(colorA, colorB, amount) {
    const from = hexToRgb(colorA);
    const to = hexToRgb(colorB);
    const ratio = Math.max(0, Math.min(1, Number(amount) || 0));

    return rgbToHex(
      from.r + (to.r - from.r) * ratio,
      from.g + (to.g - from.g) * ratio,
      from.b + (to.b - from.b) * ratio
    );
  }

  function rgba(color, alpha) {
    const rgb = hexToRgb(color);
    const opacity = Math.max(0, Math.min(1, Number(alpha) || 0));
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
  }

  function getPresetColors(presetId) {
    return PRESETS[presetId]?.colors || PRESETS[DEFAULT_PRESET].colors;
  }

  function normalizeSettings(rawSettings) {
    const preset = rawSettings?.preset === 'custom' || PRESETS[rawSettings?.preset]
      ? rawSettings.preset
      : DEFAULT_PRESET;

    const custom = {};
    THEME_KEYS.forEach((key) => {
      const fallback = getPresetColors(DEFAULT_PRESET)[key];
      custom[key] = normalizeHex(rawSettings?.custom?.[key], fallback);
    });

    return { preset, custom };
  }

  function resolveTheme(rawSettings) {
    const settings = normalizeSettings(rawSettings);
    const baseColors = settings.preset === 'custom'
      ? { ...getPresetColors(DEFAULT_PRESET), ...settings.custom }
      : getPresetColors(settings.preset);

    const bg = normalizeHex(baseColors.bg, PRESETS[DEFAULT_PRESET].colors.bg);
    const bg2 = normalizeHex(baseColors.bg2, mix(bg, '#ffffff', 0.06));
    const bg3 = normalizeHex(baseColors.bg3, mix(bg2, '#ffffff', 0.08));
    const accent = normalizeHex(baseColors.accent, PRESETS[DEFAULT_PRESET].colors.accent);
    const accent2 = normalizeHex(baseColors.accent2, mix(accent, '#ffffff', 0.28));
    const text = normalizeHex(baseColors.text, PRESETS[DEFAULT_PRESET].colors.text);
    const muted = normalizeHex(baseColors.muted, PRESETS[DEFAULT_PRESET].colors.muted);
    const bg4 = mix(bg3, '#ffffff', 0.09);
    const border = rgba(text, 0.08);

    return {
      preset: settings.preset,
      bg,
      bg2,
      bg3,
      bg4,
      accent,
      accent2,
      text,
      muted,
      border,
      green: STATIC_COLORS.green,
      amber: STATIC_COLORS.amber,
      red: STATIC_COLORS.red,
      blue: STATIC_COLORS.blue,
      bgDark: bg,
      bgDarker: mix(bg, '#000000', 0.22),
      bgCard: bg3,
      bgHover: bg4,
      textPrimary: text,
      textSecondary: muted,
      textMuted: mix(muted, bg, 0.28),
      primaryOrange: accent,
      primaryPeach: accent2,
      primaryBlue: mix(accent, '#124c81', 0.42),
      primarySlate: mix(accent2, '#4a6190', 0.35),
      primaryGray: muted,
      primaryPurple: mix(accent2, '#3c345c', 0.45),
      accentOrange: accent,
      accentBlue: mix(accent, '#124c81', 0.48),
      accentPurple: accent2,
      borderColor: border,
      borderHover: rgba(text, 0.16),
      priorityCritical: STATIC_COLORS.priorityCritical,
      priorityHigh: STATIC_COLORS.priorityHigh,
      priorityMedium: STATIC_COLORS.priorityMedium,
      priorityLow: STATIC_COLORS.priorityLow,
      priorityInfo: STATIC_COLORS.priorityInfo,
      priorityPersonal: STATIC_COLORS.priorityPersonal,
      glowOrange: `0 0 20px ${rgba(accent, 0.3)}`,
      glowBlue: `0 0 20px ${rgba(mix(accent, '#124c81', 0.48), 0.3)}`,
      glowPurple: `0 0 20px ${rgba(accent2, 0.3)}`
    };
  }

  function applyTheme(rawSettings, targetDocument) {
    const doc = targetDocument || (typeof document !== 'undefined' ? document : null);
    const theme = resolveTheme(rawSettings);

    if (!doc?.documentElement?.style) {
      return theme;
    }

    const style = doc.documentElement.style;
    style.setProperty('--bg', theme.bg);
    style.setProperty('--bg2', theme.bg2);
    style.setProperty('--bg3', theme.bg3);
    style.setProperty('--bg4', theme.bg4);
    style.setProperty('--accent', theme.accent);
    style.setProperty('--accent2', theme.accent2);
    style.setProperty('--green', theme.green);
    style.setProperty('--amber', theme.amber);
    style.setProperty('--red', theme.red);
    style.setProperty('--blue', theme.blue);
    style.setProperty('--text', theme.text);
    style.setProperty('--muted', theme.muted);
    style.setProperty('--border', theme.border);

    style.setProperty('--bg-dark', theme.bgDark);
    style.setProperty('--bg-darker', theme.bgDarker);
    style.setProperty('--bg-card', theme.bgCard);
    style.setProperty('--bg-hover', theme.bgHover);
    style.setProperty('--text-primary', theme.textPrimary);
    style.setProperty('--text-secondary', theme.textSecondary);
    style.setProperty('--text-muted', theme.textMuted);
    style.setProperty('--primary-orange', theme.primaryOrange);
    style.setProperty('--primary-peach', theme.primaryPeach);
    style.setProperty('--primary-blue', theme.primaryBlue);
    style.setProperty('--primary-slate', theme.primarySlate);
    style.setProperty('--primary-gray', theme.primaryGray);
    style.setProperty('--primary-purple', theme.primaryPurple);
    style.setProperty('--accent-orange', theme.accentOrange);
    style.setProperty('--accent-blue', theme.accentBlue);
    style.setProperty('--accent-purple', theme.accentPurple);
    style.setProperty('--border-color', theme.borderColor);
    style.setProperty('--border-hover', theme.borderHover);
    style.setProperty('--priority-critical', theme.priorityCritical);
    style.setProperty('--priority-high', theme.priorityHigh);
    style.setProperty('--priority-medium', theme.priorityMedium);
    style.setProperty('--priority-low', theme.priorityLow);
    style.setProperty('--priority-info', theme.priorityInfo);
    style.setProperty('--priority-personal', theme.priorityPersonal);
    style.setProperty('--glow-orange', theme.glowOrange);
    style.setProperty('--glow-blue', theme.glowBlue);
    style.setProperty('--glow-purple', theme.glowPurple);
    doc.documentElement.dataset.themePreset = theme.preset;

    const metaTheme = doc.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme.bg);
    }

    return theme;
  }

  async function loadAndApply(targetDocument) {
    if (typeof window === 'undefined' || !window.fp?.get) {
      return resolveTheme();
    }

    const settings = await window.fp.get('appTheme');
    return applyTheme(settings, targetDocument);
  }

  const api = {
    DEFAULT_PRESET,
    PRESETS,
    THEME_KEYS,
    normalizeSettings,
    resolveTheme,
    applyTheme,
    loadAndApply
  };

  if (typeof window !== 'undefined' && window.fp?.get) {
    loadAndApply().catch(() => {});
  }

  return api;
});
