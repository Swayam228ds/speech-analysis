# Speech Analysis Platform

This is the backend for a Speech Analysis Platform, built with FastAPI and PostgreSQL. It allows users to authenticate, upload videos, processes the audio to extract speech metrics, and stores the results for later retrieval.

## Features Implemented
- **Authentication**: JWT-based login and registration. Data is isolated per user.
- **Background Processing**: Video processing is handled asynchronously via a polling worker script to prevent API blocking.
- **Robust VAD**: Silero VAD integration for precise speech and pause detection.
- **Advanced Metrics**: Word-level timestamps via Whisper, filler word tracking, pause frequency, and active speaking rate calculation.
- **Pure SQL**: No ORM is used. All PostgreSQL interaction is done via raw `psycopg2` queries.

## Project Structure
```
.
├── app/
│   ├── main.py               # FastAPI application
│   ├── database.py           # DB connection handling
│   ├── routers/              # API Endpoints (auth.py, videos.py)
│   ├── services/             # Core logic (video_processor, speech_analyzer, pause_analyzer)
│   ├── models/               # Pydantic validation schemas (schemas.py)
│   └── utils/                # Configuration and JWT security (config.py, security.py)
├── queries/                  # Raw SQL migration scripts
│   └── migration.sql         # Script to create/update tables
├── uploads/                  # Local storage for uploaded video files
├── venv/                     # Python virtual environment
├── worker.py                 # Background processing worker
└── frontend_guide.md         # Guide for building a frontend
```

## Setup & Installation

1. **Clone the repository and navigate to the project directory:**
   ```bash
   cd "web tech project"
   ```

2. **Activate the virtual environment:**
   ```bash
   # On Windows
   venv\Scripts\activate
   ```

3. **Install Dependencies:**
   ```bash
   pip install fastapi uvicorn psycopg2-binary python-multipart python-jose[cryptography] passlib[bcrypt] python-dotenv openai-whisper torch torchaudio pydub
   ```

4. **Environment Variables:**
   Create a `.env` file in the root directory:
   ```env
   DB_HOST=localhost
   DB_NAME=speechImprovement
   DB_USER=postgres
   DB_PASS=Ak1979
   DB_PORT=5432
   SECRET_KEY=your-super-secret-jwt-key
   ```

5. **Database Setup:**
   Run the `queries/migration.sql` script against your PostgreSQL instance to create the necessary tables and update the existing `analyses` table.

6. **Run the API:**
   ```bash
   uvicorn app.main:app --reload
   ```

7. **Run the Background Worker:**
   Open a separate terminal, activate the virtual environment, and run:
   ```bash
   python worker.py
   ```

## Processing Flow
1. User uploads a video via `POST /videos/upload`.
2. The API saves the file to `uploads/`, creates a video record, and inserts a job into `processing_jobs` with status `queued`.
3. The API immediately returns the `video_id`.
4. `worker.py` polls `processing_jobs`, finds the queued job, and begins processing.
5. Audio is extracted -> Whisper transcribes and finds fillers -> Silero VAD finds pauses -> Metrics are calculated.
6. The database is updated with results, events, and the job is marked `completed`.
7. The extracted audio file is deleted.
