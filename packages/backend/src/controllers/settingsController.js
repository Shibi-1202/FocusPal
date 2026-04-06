const db = require('../config/database');

/**
 * Get user settings
 */
exports.getSettings = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(
      'SELECT * FROM settings WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Create default settings if not exists
      await db.query('INSERT INTO settings (user_id) VALUES ($1)', [userId]);
      const newResult = await db.query('SELECT * FROM settings WHERE user_id = $1', [userId]);
      return res.json({ settings: formatSettings(newResult.rows[0]) });
    }

    res.json({ settings: formatSettings(result.rows[0]) });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
};

/**
 * Update user settings
 */
exports.updateSettings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const settings = req.body;

    const updates = [];
    const params = [];
    let paramCount = 1;

    // Map frontend keys to database columns
    const fieldMap = {
      wordLookupCacheSize: 'word_lookup_cache_size',
      pomodoroWorkDuration: 'pomodoro_work_duration',
      pomodoroShortBreak: 'pomodoro_short_break',
      pomodoroLongBreak: 'pomodoro_long_break',
      pomodoroCyclesBeforeLong: 'pomodoro_cycles_before_long'
    };

    Object.keys(settings).forEach(key => {
      const dbColumn = fieldMap[key];
      if (dbColumn) {
        updates.push(`${dbColumn} = $${paramCount++}`);
        params.push(settings[key]);
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(userId);

    await db.query(
      `UPDATE settings SET ${updates.join(', ')} WHERE user_id = $${paramCount}`,
      params
    );

    // Fetch updated settings
    const result = await db.query('SELECT * FROM settings WHERE user_id = $1', [userId]);

    res.json({
      message: 'Settings updated successfully',
      settings: formatSettings(result.rows[0])
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

/**
 * Helper: Format settings for response
 */
function formatSettings(settings) {
  return {
    wordLookupCacheSize: settings.word_lookup_cache_size,
    pomodoroWorkDuration: settings.pomodoro_work_duration,
    pomodoroShortBreak: settings.pomodoro_short_break,
    pomodoroLongBreak: settings.pomodoro_long_break,
    pomodoroCyclesBeforeLong: settings.pomodoro_cycles_before_long,
    updatedAt: settings.updated_at
  };
}
