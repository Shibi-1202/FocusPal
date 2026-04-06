const db = require('../config/database');

/**
 * Get all tasks for user
 */
exports.getTasks = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date, startDate, endDate } = req.query;

    let query = 'SELECT * FROM tasks WHERE user_id = $1';
    const params = [userId];

    if (date) {
      query += ' AND task_date = $2';
      params.push(date);
    } else if (startDate && endDate) {
      query += ' AND task_date BETWEEN $2 AND $3';
      params.push(startDate, endDate);
    }

    query += ' ORDER BY task_date, start_time';

    const result = await db.query(query, params);

    res.json({
      tasks: result.rows.map(formatTask)
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
};

/**
 * Create new task
 */
exports.createTask = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      name,
      startTime,
      endTime,
      priority,
      recurring,
      color,
      taskDate
    } = req.body;

    // Validation
    if (!name || !startTime || !endTime) {
      return res.status(400).json({ error: 'Name, start time, and end time are required' });
    }

    const result = await db.query(
      `INSERT INTO tasks 
       (user_id, name, start_time, end_time, priority, recurring, color, task_date) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [
        userId,
        name,
        startTime,
        endTime,
        priority || 'medium',
        recurring || 'none',
        color || '#7c6cfc',
        taskDate || new Date().toISOString().split('T')[0]
      ]
    );

    res.status(201).json({
      message: 'Task created successfully',
      task: formatTask(result.rows[0])
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
};

/**
 * Update task
 */
exports.updateTask = async (req, res) => {
  try {
    const userId = req.user.userId;
    const taskId = req.params.id;
    const {
      name,
      startTime,
      endTime,
      priority,
      recurring,
      status,
      completionNote,
      color
    } = req.body;

    // Check if task belongs to user
    const checkResult = await db.query(
      'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
      [taskId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      params.push(name);
    }
    if (startTime !== undefined) {
      updates.push(`start_time = $${paramCount++}`);
      params.push(startTime);
    }
    if (endTime !== undefined) {
      updates.push(`end_time = $${paramCount++}`);
      params.push(endTime);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramCount++}`);
      params.push(priority);
    }
    if (recurring !== undefined) {
      updates.push(`recurring = $${paramCount++}`);
      params.push(recurring);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      params.push(status);
      
      if (status === 'completed') {
        updates.push(`completed_at = CURRENT_TIMESTAMP`);
      }
    }
    if (completionNote !== undefined) {
      updates.push(`completion_note = $${paramCount++}`);
      params.push(completionNote);
    }
    if (color !== undefined) {
      updates.push(`color = $${paramCount++}`);
      params.push(color);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(taskId, userId);

    const result = await db.query(
      `UPDATE tasks SET ${updates.join(', ')} 
       WHERE id = $${paramCount++} AND user_id = $${paramCount++} 
       RETURNING *`,
      params
    );

    res.json({
      message: 'Task updated successfully',
      task: formatTask(result.rows[0])
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
};

/**
 * Delete task
 */
exports.deleteTask = async (req, res) => {
  try {
    const userId = req.user.userId;
    const taskId = req.params.id;

    const result = await db.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
      [taskId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

/**
 * Bulk sync tasks (for offline sync)
 */
exports.syncTasks = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { tasks, lastSync } = req.body;

    if (!Array.isArray(tasks)) {
      return res.status(400).json({ error: 'Tasks must be an array' });
    }

    // Get server tasks modified after lastSync
    let serverTasks = [];
    if (lastSync) {
      const result = await db.query(
        'SELECT * FROM tasks WHERE user_id = $1 AND created_at > $2',
        [userId, lastSync]
      );
      serverTasks = result.rows.map(formatTask);
    }

    // Process client tasks
    const syncedTasks = [];
    for (const task of tasks) {
      if (task.id && task.id.toString().includes('_')) {
        // Client-generated ID, create new task
        const result = await db.query(
          `INSERT INTO tasks 
           (user_id, name, start_time, end_time, priority, recurring, status, completion_note, color, task_date) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
           RETURNING *`,
          [
            userId,
            task.name,
            task.start,
            task.end,
            task.priority,
            task.recurring,
            task.status,
            task.completionNote,
            task.color,
            task.taskDate || new Date().toISOString().split('T')[0]
          ]
        );
        syncedTasks.push(formatTask(result.rows[0]));
      } else if (task.id) {
        // Server ID, update existing task
        const result = await db.query(
          `UPDATE tasks 
           SET name = $1, start_time = $2, end_time = $3, priority = $4, 
               recurring = $5, status = $6, completion_note = $7, color = $8
           WHERE id = $9 AND user_id = $10 
           RETURNING *`,
          [
            task.name,
            task.start,
            task.end,
            task.priority,
            task.recurring,
            task.status,
            task.completionNote,
            task.color,
            task.id,
            userId
          ]
        );
        if (result.rows.length > 0) {
          syncedTasks.push(formatTask(result.rows[0]));
        }
      }
    }

    res.json({
      message: 'Sync successful',
      syncedTasks,
      serverTasks,
      syncTimestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync tasks error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
};

/**
 * Helper: Format task for response
 */
function formatTask(task) {
  return {
    id: task.id,
    name: task.name,
    start: task.start_time,
    end: task.end_time,
    priority: task.priority,
    recurring: task.recurring,
    status: task.status,
    completionNote: task.completion_note,
    color: task.color,
    taskDate: task.task_date,
    createdAt: task.created_at,
    completedAt: task.completed_at
  };
}
