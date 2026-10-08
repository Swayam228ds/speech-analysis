import json
from app.utils.ffmpeg import extract_audio
from app.processing.speech.whisper_service import analyze_speech
from app.processing.speech.vad_service import analyze_pauses
from app.processing.video.video_pipeline import process_video_visuals

def run_full_pipeline(video_path):
    print(f"Starting pipeline for {video_path}")
    
    # --- 1. Speech Pipeline ---
    print("Extracting audio...")
    audio_path = extract_audio(video_path)
    
    print("Analyzing speech (Whisper)...")
    speech_results = analyze_speech(audio_path)
    
    print("Analyzing pauses (Silero VAD)...")
    vad_results = analyze_pauses(audio_path)
    
    # Combine speech results
    speech_duration = float(vad_results["speech_duration"])
    video_duration = float(speech_results["duration"])
    speaking_rate = float((speech_results["word_count"] / speech_duration) * 60 if speech_duration > 0 else 0)
    filler_freq = float((len(speech_results["filler_events"]) / speech_duration) * 60 if speech_duration > 0 else 0)
    speaking_time_percentage = float((speech_duration / video_duration) * 100 if video_duration > 0 else 0)
    
    final_speech_metrics = {
        "transcript": speech_results["transcript"],
        "word_count": int(speech_results["word_count"]),
        "words_per_minute": speaking_rate,
        "filler_word_count": int(len(speech_results["filler_events"])),
        "pause_count": int(vad_results["pause_count"]),
        "average_pause_duration": float(vad_results["average_pause_duration"]),
        "speech_duration": speech_duration,
        "total_silence_duration": float(vad_results["total_silence_duration"]),
        "longest_pause": float(vad_results["longest_pause"]),
        "speech_start_time": float(vad_results["speech_start_time"]),
        "speech_end_time": float(vad_results["speech_end_time"]),
        "speaking_time_percentage": speaking_time_percentage,
        "filler_frequency": filler_freq,
        "word_timestamps": speech_results["word_timestamps"]
    }
    
    final_speech_events = []
    for p in vad_results["pause_events"]:
        final_speech_events.append({
            "type": "PAUSE",
            "start_time": float(p["start_time"]),
            "end_time": float(p["end_time"]),
            "duration": float(p["duration"])
        })
    for f in speech_results["filler_events"]:
        final_speech_events.append({
            "type": "FILLER_WORD",
            "start_time": float(f["start_time"]),
            "end_time": float(f["end_time"]),
            "duration": float(f["end_time"]) - float(f["start_time"]),
            "metadata": {"word": f["filler_word"]}
        })
        
    # --- 2. Video Pipeline ---
    print("Analyzing video visuals...")
    video_results = process_video_visuals(video_path)
    
    return {
        "speech_metrics": final_speech_metrics,
        "speech_events": final_speech_events,
        "video_metrics": video_results["metrics"],
        "video_events": video_results["events"],
        "video_duration": video_duration
    }
