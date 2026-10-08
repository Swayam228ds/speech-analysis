import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_NAME: str = os.getenv("DB_NAME", "speechImprovement")
    DB_USER: str = os.getenv("DB_USER", "postgres")
    DB_PASS: str = os.getenv("DB_PASS", "Ak1979")
    DB_PORT: str = os.getenv("DB_PORT", "5432")

    SECRET_KEY: str = os.getenv("SECRET_KEY", "super-secret-key-replace-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Full path to ffmpeg(.exe), or just "ffmpeg" if it is on PATH.
    FFMPEG_BIN: str = os.getenv("FFMPEG_BIN", "ffmpeg")

settings = Settings()
