import subprocess
import os
from app.utils.config import settings



def extract_audio(video_path):

    audio_path = video_path.rsplit(".", 1)[0] + ".wav"

    command = [
        settings.FFMPEG_BIN,
        "-i", video_path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        audio_path,
        "-y"
    ]

    subprocess.run(
        command,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    return audio_path