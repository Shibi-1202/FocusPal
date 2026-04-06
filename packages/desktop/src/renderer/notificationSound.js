(function () {
  const DEFAULT_SOUND = 'soft-chime';
  const DEFAULT_VOLUME = 1;
  const MASTER_GAIN = 2.8;
  const MAX_OUTPUT_GAIN = 0.24;

  const SOUND_PRESETS = {
    off: {
      label: 'Off',
      tones: []
    },
    'soft-chime': {
      label: 'Soft Chime',
      tones: [
        { freq: 740, duration: 0.12, delay: 0, type: 'sine', gain: 0.07 },
        { freq: 988, duration: 0.2, delay: 0.1, type: 'sine', gain: 0.052 }
      ]
    },
    bell: {
      label: 'Bell',
      tones: [
        { freq: 660, duration: 0.13, delay: 0, type: 'triangle', gain: 0.082 },
        { freq: 1320, duration: 0.22, delay: 0.03, type: 'sine', gain: 0.04 }
      ]
    },
    glass: {
      label: 'Glass',
      tones: [
        { freq: 1046, duration: 0.09, delay: 0, type: 'sine', gain: 0.058 },
        { freq: 1568, duration: 0.14, delay: 0.06, type: 'sine', gain: 0.034 }
      ]
    },
    pulse: {
      label: 'Pulse',
      tones: [
        { freq: 520, duration: 0.08, delay: 0, type: 'square', gain: 0.04 },
        { freq: 520, duration: 0.08, delay: 0.12, type: 'square', gain: 0.04 }
      ]
    }
  };

  let audioContext = null;

  function normalize(soundId) {
    return Object.prototype.hasOwnProperty.call(SOUND_PRESETS, soundId)
      ? soundId
      : DEFAULT_SOUND;
  }

  async function getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (error) {
        return audioContext;
      }
    }

    return audioContext;
  }

  async function play(soundId = DEFAULT_SOUND, options = {}) {
    const selectedSound = normalize(soundId);
    if (selectedSound === 'off') return false;

    const preset = SOUND_PRESETS[selectedSound];
    const context = await getAudioContext();
    if (!context) return false;

    const volume = typeof options.volume === 'number' ? options.volume : DEFAULT_VOLUME;
    const baseTime = context.currentTime + 0.01;
    const output = context.createGain();
    const compressor = typeof context.createDynamicsCompressor === 'function'
      ? context.createDynamicsCompressor()
      : null;

    output.gain.setValueAtTime(1, baseTime);

    if (compressor) {
      compressor.threshold.setValueAtTime(-18, baseTime);
      compressor.knee.setValueAtTime(18, baseTime);
      compressor.ratio.setValueAtTime(3, baseTime);
      compressor.attack.setValueAtTime(0.003, baseTime);
      compressor.release.setValueAtTime(0.15, baseTime);
      output.connect(compressor);
      compressor.connect(context.destination);
    } else {
      output.connect(context.destination);
    }

    preset.tones.forEach((tone) => {
      const startAt = baseTime + (tone.delay || 0);
      const stopAt = startAt + (tone.duration || 0.12);
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      const targetGain = Math.min(
        MAX_OUTPUT_GAIN,
        Math.max(0.0001, (tone.gain || 0.04) * volume * MASTER_GAIN)
      );

      oscillator.type = tone.type || 'sine';
      oscillator.frequency.setValueAtTime(tone.freq, startAt);

      gainNode.gain.setValueAtTime(0.0001, startAt);
      gainNode.gain.exponentialRampToValueAtTime(
        targetGain,
        startAt + 0.008
      );
      gainNode.gain.exponentialRampToValueAtTime(0.0001, stopAt);

      oscillator.connect(gainNode);
      gainNode.connect(output);

      oscillator.start(startAt);
      oscillator.stop(stopAt + 0.02);
    });

    return true;
  }

  async function unlockAudio() {
    await getAudioContext();
  }

  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });

  window.FocusPalNotificationSound = {
    DEFAULT_SOUND,
    getOptions() {
      return Object.entries(SOUND_PRESETS).map(([value, config]) => ({
        value,
        label: config.label
      }));
    },
    normalize,
    play
  };
})();
