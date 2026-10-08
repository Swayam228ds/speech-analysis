from fastapi import APIRouter, Depends, HTTPException, status
from app.database import get_connection
from app.utils.security import get_current_user

router = APIRouter(
    prefix="/videos",
    tags=["Analysis"]
)

@router.get("/{video_id}/analysis")
def get_video_analysis(video_id: int, current_user: dict = Depends(get_current_user)):
    connection = get_connection()
    cursor = connection.cursor()
    
    # Check video ownership
    cursor.execute("SELECT id, duration_seconds, processing_status FROM videos WHERE id = %s AND user_id = %s;", (video_id, current_user["id"]))
    video = cursor.fetchone()
    if not video:
        cursor.close()
        connection.close()
        raise HTTPException(status_code=404, detail="Video not found")
        
    video_data = {
        "id": video[0],
        "duration": float(video[1]) if video[1] else 0.0,
        "status": video[2]
    }
    
    if video_data["status"] != "completed":
        cursor.close()
        connection.close()
        return {"video": video_data, "message": "Analysis is not completed yet."}

    # Fetch speech metrics
    cursor.execute("""
        SELECT transcript, word_count, words_per_minute, speaking_time_percentage,
               pause_count, average_pause_duration, longest_pause, filler_word_count, filler_frequency
        FROM analyses WHERE video_id = %s;
    """, (video_id,))
    speech_row = cursor.fetchone()
    speech_data = {}
    if speech_row:
        speech_data = {
            "transcript": speech_row[0],
            "word_count": speech_row[1],
            "words_per_minute": float(speech_row[2]) if speech_row[2] else 0.0,
            "speaking_time_percentage": float(speech_row[3]) if speech_row[3] else 0.0,
            "pause_count": speech_row[4],
            "average_pause_duration": float(speech_row[5]) if speech_row[5] else 0.0,
            "longest_pause": float(speech_row[6]) if speech_row[6] else 0.0,
            "filler_word_count": speech_row[7],
            "filler_frequency": float(speech_row[8]) if speech_row[8] else 0.0
        }

    # Fetch video metrics
    cursor.execute("""
        SELECT face_visibility_ratio, camera_facing_ratio, head_movement_count,
               body_movement_ratio, hand_activity_ratio, posture_change_count
        FROM video_metrics WHERE video_id = %s;
    """, (video_id,))
    video_row = cursor.fetchone()
    video_metrics = {}
    if video_row:
        video_metrics = {
            "face_visibility_ratio": float(video_row[0]) if video_row[0] else 0.0,
            "camera_facing_ratio": float(video_row[1]) if video_row[1] else 0.0,
            "head_movement_count": video_row[2],
            "body_movement_ratio": float(video_row[3]) if video_row[3] else 0.0,
            "hand_activity_ratio": float(video_row[4]) if video_row[4] else 0.0,
            "posture_change_count": video_row[5]
        }

    events = []
    
    # Fetch speech events (pauses and fillers)
    cursor.execute("SELECT start_time, end_time FROM pause_events WHERE video_id = %s ORDER BY start_time;", (video_id,))
    for p in cursor.fetchall():
        events.append({"type": "PAUSE", "start": float(p[0]), "end": float(p[1])})
        
    cursor.execute("SELECT start_time, end_time, filler_word FROM filler_events WHERE video_id = %s ORDER BY start_time;", (video_id,))
    for f in cursor.fetchall():
        events.append({"type": "FILLER_WORD", "start": float(f[0]), "end": float(f[1]), "word": f[2]})
        
    # Fetch visual events
    cursor.execute("SELECT event_type, start_time, end_time FROM visual_events WHERE video_id = %s ORDER BY start_time;", (video_id,))
    for v in cursor.fetchall():
        events.append({"type": v[0], "start": float(v[1]), "end": float(v[2])})
        
    # Sort all events chronologically
    events = sorted(events, key=lambda x: x["start"])

    cursor.close()
    connection.close()

    return {
        "video": video_data,
        "speech": speech_data,
        "video_metrics": video_metrics,
        "events": events
    }
