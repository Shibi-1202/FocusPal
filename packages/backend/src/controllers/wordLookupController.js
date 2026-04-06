const db = require('../config/database');

function normalizeDefinitionForDb(definition) {
  if (definition === undefined) {
    return null;
  }

  if (definition === null) {
    return null;
  }

  if (typeof definition === 'string') {
    return JSON.stringify(definition);
  }

  return JSON.stringify(definition);
}

/**
 * Get word lookup cache
 */
exports.getCache = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit } = req.query;

    let query = 'SELECT * FROM word_lookup_cache WHERE user_id = $1 ORDER BY last_accessed DESC';
    const params = [userId];

    if (limit) {
      query += ' LIMIT $2';
      params.push(parseInt(limit));
    }

    const result = await db.query(query, params);

    res.json({
      cache: result.rows.map(w => ({
        word: w.word,
        definition: w.definition,
        translation: w.translation,
        accessCount: w.access_count,
        lastAccessed: w.last_accessed
      }))
    });
  } catch (error) {
    console.error('Get cache error:', error);
    res.status(500).json({ error: 'Failed to fetch cache' });
  }
};

/**
 * Add or update word in cache
 */
exports.addToCache = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { word, definition, translation } = req.body;
    const normalizedDefinition = normalizeDefinitionForDb(definition);

    if (!word) {
      return res.status(400).json({ error: 'Word is required' });
    }

    // Check if word exists
    const existing = await db.query(
      'SELECT id, access_count FROM word_lookup_cache WHERE user_id = $1 AND word = $2',
      [userId, word]
    );

    if (existing.rows.length > 0) {
      // Update existing
      await db.query(
        `UPDATE word_lookup_cache 
         SET definition = $1, translation = $2, access_count = access_count + 1, 
             last_accessed = CURRENT_TIMESTAMP 
         WHERE user_id = $3 AND word = $4`,
        [normalizedDefinition, translation, userId, word]
      );
    } else {
      // Insert new
      await db.query(
        `INSERT INTO word_lookup_cache 
         (user_id, word, definition, translation) 
         VALUES ($1, $2, $3, $4)`,
        [userId, word, normalizedDefinition, translation]
      );

      // Enforce cache size limit (get from settings)
      const settingsResult = await db.query(
        'SELECT word_lookup_cache_size FROM settings WHERE user_id = $1',
        [userId]
      );

      const cacheSize = settingsResult.rows[0]?.word_lookup_cache_size || 20;

      // Delete oldest entries if over limit
      await db.query(
        `DELETE FROM word_lookup_cache 
         WHERE user_id = $1 AND id NOT IN (
           SELECT id FROM word_lookup_cache 
           WHERE user_id = $1 
           ORDER BY last_accessed DESC 
           LIMIT $2
         )`,
        [userId, cacheSize]
      );
    }

    res.json({ message: 'Word added to cache successfully' });
  } catch (error) {
    console.error('Add to cache error:', error);
    res.status(500).json({ error: 'Failed to add to cache' });
  }
};

/**
 * Delete word from cache
 */
exports.deleteFromCache = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { word } = req.params;

    const result = await db.query(
      'DELETE FROM word_lookup_cache WHERE user_id = $1 AND word = $2 RETURNING id',
      [userId, word]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Word not found in cache' });
    }

    res.json({ message: 'Word deleted from cache successfully' });
  } catch (error) {
    console.error('Delete from cache error:', error);
    res.status(500).json({ error: 'Failed to delete from cache' });
  }
};

/**
 * Clear entire cache
 */
exports.clearCache = async (req, res) => {
  try {
    const userId = req.user.userId;

    await db.query('DELETE FROM word_lookup_cache WHERE user_id = $1', [userId]);

    res.json({ message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
};
