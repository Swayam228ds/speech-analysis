import os
import torch
import soundfile as sf
import numpy as np

# Load Silero VAD from PyTorch Hub
model, utils = torch.hub.load(repo_or_dir='snakers4/silero-vad', model='silero_vad', force_reload=False)
(get_speech_timestamps, save_audio, read_audio_silero, VADIterator, collect_chunks) = utils

def read_audio_safe(path: str, target_sr: int = 16000):
    # Read using soundfile which does not depend on FFmpeg DLLs
    wav, sr = sf.read(path)
    if wav.ndim > 1:
        wav = wav.mean(axis=1) # Convert to mono
    
    # We rely on the fact that extract_audio in video_processor likely 
    # outputs 16000Hz anyway, but if not we would resample. 
    # For simplicity, convert to float32 tensor.
    wav = torch.FloatTensor(wav)
    if wav.dim() == 1:
        wav = wav.unsqueeze(0)
    return wav

def analyze_pauses(audio_path):
    wav = read_audio_safe(audio_path, target_sr=16000)
    
    # get_speech_timestamps returns a list of dicts with 'start' and 'end' in samples
    speech_timestamps = get_speech_timestamps(wav, model, sampling_rate=16000)
    
    total_audio_samples = wav.shape[1] if wav.dim() > 1 else wav.shape[0]
    total_audio_duration = total_audio_samples / 16000.0

    speech_duration = 0
    pause_events = []
    
    # Calculate pauses (time between speech segments)
    for i in range(len(speech_timestamps)):
        start_time = speech_timestamps[i]['start'] / 16000.0
        end_time = speech_timestamps[i]['end'] / 16000.0
        speech_duration += (end_time - start_time)
        
        if i < len(speech_timestamps) - 1:
            next_start_time = speech_timestamps[i+1]['start'] / 16000.0
            pause_dur = next_start_time - end_time
            if pause_dur > 0:
                pause_events.append({
                    "start_time": end_time,
                    "end_time": next_start_time,
                    "duration": pause_dur
                })

    pause_count = len(pause_events)
    total_silence_duration = sum(p["duration"] for p in pause_events)
    longest_pause = max([p["duration"] for p in pause_events]) if pause_count > 0 else 0
    average_pause_duration = total_silence_duration / pause_count if pause_count > 0 else 0
    
    speech_start_time = speech_timestamps[0]['start'] / 16000.0 if speech_timestamps else 0
    speech_end_time = speech_timestamps[-1]['end'] / 16000.0 if speech_timestamps else 0

    return {
        "speech_duration": speech_duration,
        "total_silence_duration": total_silence_duration,
        "pause_events": pause_events,
        "pause_count": pause_count,
        "longest_pause": longest_pause,
        "average_pause_duration": average_pause_duration,
        "speech_start_time": speech_start_time,
        "speech_end_time": speech_end_time
    }