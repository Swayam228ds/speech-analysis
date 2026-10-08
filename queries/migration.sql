-- Migration to add authentication, background processing, and word-level metrics

-- 1. Create users table (if it doesn't exist, though it's referenced in videos)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create processing_jobs table
CREATE TABLE IF NOT EXISTS processing_jobs (
    id SERIAL PRIMARY KEY,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'queued', -- queued, processing, completed, failed
    stage VARCHAR(50), -- uploaded, processing_audio, transcribing, analyzing_speech, analyzing_video
    progress INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create pause_events table
CREATE TABLE IF NOT EXISTS pause_events (
    id SERIAL PRIMARY KEY,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    start_time NUMERIC,
    end_time NUMERIC,
    duration NUMERIC
);

-- 4. Create filler_events table
CREATE TABLE IF NOT EXISTS filler_events (
    id SERIAL PRIMARY KEY,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    filler_word VARCHAR(50),
    start_time NUMERIC,
    end_time NUMERIC
);

-- 5. Add new columns to analyses table
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS speech_duration NUMERIC;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS total_silence_duration NUMERIC;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS longest_pause NUMERIC;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS speech_start_time NUMERIC;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS speech_end_time NUMERIC;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS speaking_time_percentage NUMERIC;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS filler_frequency NUMERIC;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS word_timestamps JSONB; -- Optional, good for frontend rendering
