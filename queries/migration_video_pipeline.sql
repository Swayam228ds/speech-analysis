-- Migration to add video analysis pipeline tables

-- 1. Create video_metrics table
CREATE TABLE IF NOT EXISTS video_metrics (
    id SERIAL PRIMARY KEY,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    face_visibility_ratio NUMERIC,
    camera_facing_ratio NUMERIC,
    head_movement_count INTEGER,
    body_movement_ratio NUMERIC,
    hand_activity_ratio NUMERIC,
    posture_change_count INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(video_id)
);

-- 2. Create visual_events table
CREATE TABLE IF NOT EXISTS visual_events (
    id SERIAL PRIMARY KEY,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    start_time NUMERIC NOT NULL,
    end_time NUMERIC NOT NULL,
    duration NUMERIC NOT NULL,
    value NUMERIC,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Modify processing_jobs stages
-- We don't need to alter the table structure for enum values since stage is VARCHAR, 
-- but we might want to ensure overall_status is supported if we change how status works.
-- It already supports VARCHAR(50).
