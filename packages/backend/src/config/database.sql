-- FocusPal Database Schema

-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  subscription VARCHAR(20) DEFAULT 'free',
  is_active BOOLEAN DEFAULT true
);

-- Devices table
CREATE TABLE devices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(255) UNIQUE NOT NULL,
  device_name VARCHAR(100),
  platform VARCHAR(20),
  last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  widget_position_x INTEGER,
  widget_position_y INTEGER
);

-- Tasks table
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  priority VARCHAR(20) DEFAULT 'medium',
  recurring VARCHAR(20) DEFAULT 'none',
  status VARCHAR(20) DEFAULT 'pending',
  completion_note TEXT,
  color VARCHAR(7),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  task_date DATE DEFAULT CURRENT_DATE
);

-- Task history table
CREATE TABLE task_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  planned_duration INTEGER,
  actual_duration INTEGER,
  completion_note TEXT,
  focus_score INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Streaks table
CREATE TABLE streaks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  daily_streak INTEGER DEFAULT 0,
  last_completion_date DATE,
  perfect_days INTEGER DEFAULT 0,
  focus_streak INTEGER DEFAULT 0,
  milestones JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Settings table
CREATE TABLE settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  word_lookup_cache_size INTEGER DEFAULT 20,
  pomodoro_work_duration INTEGER DEFAULT 25,
  pomodoro_short_break INTEGER DEFAULT 5,
  pomodoro_long_break INTEGER DEFAULT 15,
  pomodoro_cycles_before_long INTEGER DEFAULT 4,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Word lookup cache table
CREATE TABLE word_lookup_cache (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  word VARCHAR(100) NOT NULL,
  definition JSONB,
  translation TEXT,
  access_count INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, word)
);

-- Refresh tokens table
CREATE TABLE refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_tasks_user_date ON tasks(user_id, task_date);
CREATE INDEX idx_task_history_user_date ON task_history(user_id, date);
CREATE INDEX idx_devices_user ON devices(user_id);
CREATE INDEX idx_word_cache_user ON word_lookup_cache(user_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
