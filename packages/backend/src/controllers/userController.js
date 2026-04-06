const db = require('../config/database');
const bcrypt = require('bcryptjs');

/**
 * Get user profile
 */
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT id, email, display_name, created_at, last_login, subscription 
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Get devices
    const devicesResult = await db.query(
      'SELECT device_id, device_name, platform, last_sync, widget_position_x, widget_position_y FROM devices WHERE user_id = $1',
      [userId]
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        createdAt: user.created_at,
        lastLogin: user.last_login,
        subscription: user.subscription,
        devices: devicesResult.rows.map(d => ({
          deviceId: d.device_id,
          deviceName: d.device_name,
          platform: d.platform,
          lastSync: d.last_sync,
          widgetPosition: {
            x: d.widget_position_x,
            y: d.widget_position_y
          }
        }))
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

/**
 * Update user profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { displayName, email } = req.body;

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (displayName !== undefined) {
      updates.push(`display_name = $${paramCount++}`);
      params.push(displayName);
    }

    if (email !== undefined) {
      // Check if email is already taken
      const existingUser = await db.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, userId]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({ error: 'Email already in use' });
      }

      updates.push(`email = $${paramCount++}`);
      params.push(email);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(userId);

    const result = await db.query(
      `UPDATE users SET ${updates.join(', ')} 
       WHERE id = $${paramCount} 
       RETURNING id, email, display_name`,
      params
    );

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: result.rows[0].id,
        email: result.rows[0].email,
        displayName: result.rows[0].display_name
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

/**
 * Delete user account
 */
exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password required to delete account' });
    }

    // Verify password
    const result = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValidPassword = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Delete user (cascade will delete all related data)
    await db.query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
};

/**
 * Register or update device
 */
exports.registerDevice = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { deviceId, deviceName, platform, widgetPosition } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID required' });
    }

    // Check if device exists
    const existing = await db.query(
      'SELECT id FROM devices WHERE device_id = $1',
      [deviceId]
    );

    if (existing.rows.length > 0) {
      // Update existing device
      await db.query(
        `UPDATE devices 
         SET device_name = $1, platform = $2, last_sync = CURRENT_TIMESTAMP,
             widget_position_x = $3, widget_position_y = $4
         WHERE device_id = $5`,
        [
          deviceName,
          platform,
          widgetPosition?.x,
          widgetPosition?.y,
          deviceId
        ]
      );
    } else {
      // Register new device
      await db.query(
        `INSERT INTO devices 
         (user_id, device_id, device_name, platform, widget_position_x, widget_position_y) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          deviceId,
          deviceName,
          platform,
          widgetPosition?.x,
          widgetPosition?.y
        ]
      );
    }

    res.json({ message: 'Device registered successfully' });
  } catch (error) {
    console.error('Register device error:', error);
    res.status(500).json({ error: 'Failed to register device' });
  }
};

/**
 * Export user data (GDPR compliance)
 */
exports.exportData = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get all user data
    const [user, tasks, settings, streaks, wordCache] = await Promise.all([
      db.query('SELECT * FROM users WHERE id = $1', [userId]),
      db.query('SELECT * FROM tasks WHERE user_id = $1', [userId]),
      db.query('SELECT * FROM settings WHERE user_id = $1', [userId]),
      db.query('SELECT * FROM streaks WHERE user_id = $1', [userId]),
      db.query('SELECT * FROM word_lookup_cache WHERE user_id = $1', [userId])
    ]);

    const exportData = {
      user: user.rows[0],
      tasks: tasks.rows,
      settings: settings.rows[0],
      streaks: streaks.rows[0],
      wordCache: wordCache.rows,
      exportedAt: new Date().toISOString()
    };

    res.json(exportData);
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
};
