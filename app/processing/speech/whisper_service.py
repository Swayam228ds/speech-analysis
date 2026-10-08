import os
import whisper

FFMPEG_PATH = r"C:\Users\Abhinay\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-full_build\bin"
os.environ["PATH"] = FFMPEG_PATH + os.pathsep + os.environ["PATH"]

model = whisper.load_model("base")

def analyze_speech(audio_path):
    # Using word_timestamps=True to get word-level precision
    result = model.transcribe(audio_path, fp16=False, word_timestamps=True)

    text = result["text"].strip()
    words = text.split()
    word_count = len(words)
    duration = result["segments"][-1]["end"] if result["segments"] else 0

    fillers_list = ["um", "uh", "like", "basically", "actually"]
    filler_events = []
    word_timestamps = []

    # Extract word timestamps and filler events
    for segment in result.get("segments", []):
        for word_info in segment.get("words", []):
            word_text = word_info["word"].lower().strip(".,!? ")
            start = word_info["start"]
            end = word_info["end"]
            
            word_timestamps.append({
                "word": word_info["word"],
                "start": start,
                "end": end
            })

            if word_text in fillers_list:
                filler_events.append({
                    "filler_word": word_text,
                    "start_time": start,
                    "end_time": end
                })

    return {
        "transcript": text,
        "word_count": word_count,
        "duration": duration,
        "filler_events": filler_events,
        "word_timestamps": word_timestamps
    }