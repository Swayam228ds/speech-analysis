# Speech Improvement Platform - Frontend Guide

This guide outlines the rough plan for building a frontend (React, Next.js, or similar) to interface with the FastAPI backend.

## Application Pages & Features

### 1. Authentication
* **Features:**
  * Login Form (Username, Password).
  * Registration Form (Username, Email, Password).
  * JWT Token storage (localStorage or HttpOnly cookies).
* **Backend Endpoints Used:**
  * `POST /login`: Pass `username` and `password` as `x-www-form-urlencoded` data. Save the returning `access_token`.
  * `POST /register`: Pass JSON containing `username`, `email`, and `password`.
  * `GET /me`: Use this to verify the token on page load and fetch the current user's profile.

### 2. Dashboard (Video List)
* **Features:**
  * View a grid or list of previously uploaded videos.
  * Show basic stats: duration, upload date, processing status (Queued, Processing, Completed, Failed).
  * Delete video option.
* **Backend Endpoints Used:**
  * `GET /videos`: Retrieves all videos belonging to the authenticated user.
  * `DELETE /videos/{video_id}`: Deletes a specific video.

### 3. Video Upload
* **Features:**
  * Drag-and-drop or file selection area.
  * File validation (max 100MB, video formats only).
  * Upload progress bar.
  * Redirect to the Video Details/Processing page once queued.
* **Backend Endpoints Used:**
  * `POST /videos/upload`: Send the file as `multipart/form-data`. Returns `video_id`.

### 4. Video Details / Analysis Results
* **Features:**
  * **Video Player:** Play the uploaded video.
  * **Processing State:** If the video is still processing, show a progress bar or spinner polling the status.
  * **Metrics Dashboard:** 
    * Show composite scores (Speaking rate, Speech percentage).
    * Show silence and pause metrics (Total silence, Longest pause, Average pause).
  * **Transcript Viewer:** Display the text transcript. Advanced: use `word_timestamps` JSON to highlight words as the video plays.
  * **Event Timeline:** Display a visual timeline or list of where pauses and filler words occurred, allowing users to click and jump to that specific timestamp in the video.
* **Backend Endpoints Used:**
  * `GET /videos/{video_id}`: Poll this endpoint to check `processing_status` and `job_info.progress`. Once complete, it contains the full analysis summary and `word_timestamps`.
  * `GET /videos/{video_id}/events`: Fetches the precise `pause_events` and `filler_events` for timeline visualization.
  * `GET /videos/{video_id}/file`: Use this URL as the `src` attribute in the HTML `<video>` tag (include the Bearer token in the request header or handle it via a secure proxy).

## Frontend Integration Guide for Speech & Video Improvement Platform

## Overview
This platform has two core independent, but synchronized processing pipelines:
1. **Speech Pipeline** (Whisper + Silero VAD)
2. **Video/Visual Pipeline** (MediaPipe + OpenCV)

They run in the background. Your frontend should primarily query the unified `/videos/{video_id}/analysis` endpoint.

## Frontend Implementation Tips
1. **Axios Interceptors:** Configure an Axios interceptor to automatically attach the `Authorization: Bearer <token>` header to all requests.
2. **Polling:** For the Video Details page, if `processing_status` is not `completed` or `failed`, use `setInterval` to call `GET /videos/{video_id}` every 2-3 seconds to update the UI progress bar.
3. **Word Highlighting:** The `word_timestamps` array contains `{word, start, end}`. You can sync this with the `<video>` element's `ontimeupdate` event to highlight the current word being spoken.

## Visual + Speech Combined Endpoint

To fetch everything at once once processing is complete:

`http
GET /videos/{video_id}/analysis
``n
**Response Schema:**
`json
{
  "video": {
    "id": 1,
    "duration": 45.2,
    "status": "completed"
  },
  "speech": {
    "transcript": "Hello...",
    "word_count": 120,
    "speaking_time": 40.1,
    ...
  },
  "video_metrics": {
    "face_visibility_ratio": 0.98,
    "camera_facing_ratio": 0.85,
    "body_movement_ratio": 0.20,
    "hand_activity_ratio": 0.15
  },
  "events": [
    {"type": "LOOKING_AWAY", "start": 2.5, "end": 4.1},
    {"type": "PAUSE", "start": 2.7, "end": 3.9},
    {"type": "HAND_MOVEMENT", "start": 10.0, "end": 12.5}
  ]
}
``n
### UI Design Suggestions:
1. **Unified Timeline**: Use a video player (like Video.js) and draw distinct colored markers on the progress bar for events array items. (e.g. Red for LOOKING_AWAY, Yellow for PAUSE, Blue for HAND_MOVEMENT).
2. **Synchronized Playback**: When a user clicks an event in a sidebar list, use ideo.currentTime = event.start to jump straight to that moment.

