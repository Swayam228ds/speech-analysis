import time
import json
import psycopg2
from app.database import get_connection
from app.processing.pipeline import run_full_pipeline

def process_job(job_id, video_id, video_path):
    connection = get_connection()
    cursor = connection.cursor()
    try:
        # Mark as processing_audio
        cursor.execute("UPDATE processing_jobs SET status='processing', stage='analyzing_audio_video', progress=10 WHERE id=%s;", (job_id,))
        cursor.execute("UPDATE videos SET processing_status='processing' WHERE id=%s;", (int(video_id),))
        connection.commit()

        # Run combined pipeline
        results = run_full_pipeline(video_path)
        
        cursor.execute("UPDATE processing_jobs SET stage='saving_results', progress=90 WHERE id=%s;", (job_id,))
        connection.commit()

        # Insert Analyses
        sm = results["speech_metrics"]
        word_timestamps_json = json.dumps(sm["word_timestamps"])
        cursor.execute(
            """
            INSERT INTO analyses (
                video_id, transcript, word_count, words_per_minute, filler_word_count,
                pause_count, average_pause_duration, speech_duration, total_silence_duration,
                longest_pause, speech_start_time, speech_end_time, speaking_time_percentage,
                filler_frequency, word_timestamps
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """,
            (
                int(video_id), sm["transcript"], sm["word_count"], sm["words_per_minute"], sm["filler_word_count"],
                sm["pause_count"], sm["average_pause_duration"], sm["speech_duration"], sm["total_silence_duration"],
                sm["longest_pause"], sm["speech_start_time"], sm["speech_end_time"], sm["speaking_time_percentage"],
                sm["filler_frequency"], word_timestamps_json
            )
        )
        
        # Insert Video Metrics
        vm = results["video_metrics"]
        cursor.execute(
            """
            INSERT INTO video_metrics (
                video_id, face_visibility_ratio, camera_facing_ratio, head_movement_count, 
                body_movement_ratio, hand_activity_ratio, posture_change_count
            ) VALUES (%s, %s, %s, %s, %s, %s, %s);
            """,
            (
                int(video_id), vm.get("face_visibility_ratio"), vm.get("camera_facing_ratio"),
                vm.get("head_movement_count"), vm.get("body_movement_ratio"),
                vm.get("hand_activity_ratio"), vm.get("posture_change_count")
            )
        )

        # Insert Events
        # Legacy tables for backward compatibility if needed, but the prompt says 
        # "If the existing project already has some equivalent tables, modify them instead of creating duplicates."
        # We will insert speech events into pause_events and filler_events to not break old stuff, 
        # and ALL events into visual_events (or we can insert visual only into visual_events).
        for p in results["speech_events"]:
            if p["type"] == "PAUSE":
                cursor.execute("INSERT INTO pause_events (video_id, start_time, end_time, duration) VALUES (%s, %s, %s, %s);",
                               (int(video_id), p["start_time"], p["end_time"], p["duration"]))
            elif p["type"] == "FILLER_WORD":
                cursor.execute("INSERT INTO filler_events (video_id, filler_word, start_time, end_time) VALUES (%s, %s, %s, %s);",
                               (int(video_id), p["metadata"]["word"], p["start_time"], p["end_time"]))
                               
        for v in results["video_events"]:
            cursor.execute(
                """
                INSERT INTO visual_events (video_id, event_type, start_time, end_time, duration)
                VALUES (%s, %s, %s, %s, %s);
                """,
                (int(video_id), v["type"], v["start"], v["end"], v["duration"])
            )

        # Update Video and Job Status
        cursor.execute("UPDATE videos SET processing_status='completed', duration_seconds=%s WHERE id=%s;", (results["video_duration"], int(video_id)))
        cursor.execute("UPDATE processing_jobs SET status='completed', stage='completed', progress=100 WHERE id=%s;", (job_id,))
        connection.commit()

        print(f"Job {job_id} completed successfully.")

    except Exception as e:
        connection.rollback()
        print(f"Error processing job {job_id}: {e}")
        cursor.execute("UPDATE processing_jobs SET status='failed', stage='error', error_message=%s WHERE id=%s;", (str(e)[:1000], job_id))
        cursor.execute("UPDATE videos SET processing_status='failed' WHERE id=%s;", (int(video_id),))
        connection.commit()
    finally:
        cursor.close()
        connection.close()

def poll_jobs():
    print("Worker started, polling for jobs...")
    while True:
        try:
            connection = get_connection()
            cursor = connection.cursor()
            
            cursor.execute("""
                SELECT pj.id, pj.video_id, v.file_path 
                FROM processing_jobs pj
                JOIN videos v ON pj.video_id = v.id
                WHERE pj.status = 'queued' 
                ORDER BY pj.created_at ASC 
                LIMIT 1;
            """)
            job = cursor.fetchone()
            
            cursor.close()
            connection.close()
            
            if job:
                job_id, video_id, file_path = job
                print(f"Picked up job {job_id} for video {video_id}")
                process_job(job_id, video_id, file_path)
            else:
                time.sleep(2)
        except Exception as e:
            print(f"Worker loop error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    poll_jobs()
