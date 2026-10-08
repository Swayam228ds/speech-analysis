import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import FileResponse
from app.database import get_connection
from app.utils.security import get_current_user

router = APIRouter(tags=["videos"])
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB

@router.post("/videos/upload")
async def upload_video(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    # 1. Validation
    allowed_types = ["video/mp4", "video/webm", "video/quicktime"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported video format. Allowed: mp4, webm, mov")
    
    # Optional file size check if we read chunks, but we can just enforce during read
    extension = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4()}{extension}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    # 2. Save video
    total_size = 0
    with open(file_path, "wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            total_size += len(chunk)
            if total_size > MAX_FILE_SIZE:
                os.remove(file_path)
                raise HTTPException(status_code=400, detail="File too large. Maximum size is 100MB.")
            buffer.write(chunk)

    # 3. Create database records (video and processing_job)
    connection = get_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO videos (user_id, filename, file_path, processing_status)
            VALUES (%s, %s, %s, %s) RETURNING id;
            """,
            (current_user["id"], file.filename, file_path, "queued")
        )
        video_id = cursor.fetchone()[0]

        cursor.execute(
            """
            INSERT INTO processing_jobs (video_id, status, stage, progress)
            VALUES (%s, %s, %s, %s)
            """,
            (video_id, 'queued', 'uploaded', 0)
        )
        connection.commit()
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=500, detail="Failed to create video record.")
    finally:
        cursor.close()
        connection.close()

    return {
        "message": "Video uploaded successfully and queued for processing",
        "video_id": video_id,
        "status": "queued"
    }

@router.get("/videos")
def list_user_videos(current_user: dict = Depends(get_current_user)):
    connection = get_connection()
    cursor = connection.cursor()
    
    cursor.execute(
        """
        SELECT id, filename, duration_seconds, processing_status, uploaded_at 
        FROM videos WHERE user_id = %s ORDER BY uploaded_at DESC;
        """,
        (current_user["id"],)
    )
    rows = cursor.fetchall()
    cursor.close()
    connection.close()
    
    videos = []
    for r in rows:
        videos.append({
            "video_id": r[0],
            "filename": r[1],
            "duration_seconds": r[2],
            "processing_status": r[3],
            "uploaded_at": r[4]
        })
    return {"videos": videos}

@router.get("/videos/{video_id}")
def get_video_analysis(video_id: int, current_user: dict = Depends(get_current_user)):
    connection = get_connection()
    cursor = connection.cursor()

    # Verify ownership and get data
    cursor.execute(
        """
        SELECT
            v.id, v.filename, v.duration_seconds, v.processing_status, v.uploaded_at,
            a.transcript, a.word_count, a.words_per_minute, a.filler_word_count,
            a.pause_count, a.average_pause_duration, a.speech_duration,
            a.total_silence_duration, a.longest_pause, a.speaking_time_percentage,
            a.filler_frequency, a.word_timestamps
        FROM videos v
        LEFT JOIN analyses a ON v.id = a.video_id
        WHERE v.id = %s AND v.user_id = %s;
        """,
        (video_id, current_user["id"])
    )
    result = cursor.fetchone()
    
    if not result:
        cursor.close()
        connection.close()
        raise HTTPException(status_code=404, detail="Video not found or unauthorized")

    # Get processing job status
    cursor.execute("SELECT status, stage, progress, error_message FROM processing_jobs WHERE video_id = %s;", (video_id,))
    job_result = cursor.fetchone()
    cursor.close()
    connection.close()

    job_info = None
    if job_result:
        job_info = {
            "status": job_result[0],
            "stage": job_result[1],
            "progress": job_result[2],
            "error_message": job_result[3]
        }

    response = {
        "video_id": result[0],
        "filename": result[1],
        "video_url": f"/videos/{video_id}/file",
        "duration_seconds": result[2],
        "processing_status": result[3],
        "uploaded_at": result[4],
        "job_info": job_info
    }

    if result[5] is not None:
        response["analysis"] = {
            "transcript": result[5],
            "word_count": result[6],
            "words_per_minute": result[7],
            "filler_word_count": result[8],
            "pause_count": result[9],
            "average_pause_duration": result[10],
            "speech_duration": result[11],
            "total_silence_duration": result[12],
            "longest_pause": result[13],
            "speaking_time_percentage": result[14],
            "filler_frequency": result[15],
            "word_timestamps": result[16]
        }
    return response

@router.get("/videos/{video_id}/events")
def get_video_events(video_id: int, current_user: dict = Depends(get_current_user)):
    connection = get_connection()
    cursor = connection.cursor()

    # Check ownership
    cursor.execute("SELECT id FROM videos WHERE id = %s AND user_id = %s;", (video_id, current_user["id"]))
    if not cursor.fetchone():
        cursor.close()
        connection.close()
        raise HTTPException(status_code=404, detail="Video not found")

    cursor.execute("SELECT start_time, end_time, duration FROM pause_events WHERE video_id = %s ORDER BY start_time;", (video_id,))
    pauses = [{"start_time": r[0], "end_time": r[1], "duration": r[2]} for r in cursor.fetchall()]

    cursor.execute("SELECT filler_word, start_time, end_time FROM filler_events WHERE video_id = %s ORDER BY start_time;", (video_id,))
    fillers = [{"filler_word": r[0], "start_time": r[1], "end_time": r[2]} for r in cursor.fetchall()]

    cursor.close()
    connection.close()
    return {"pause_events": pauses, "filler_events": fillers}


@router.get("/videos/{video_id}/file")
def get_video_file(video_id: int, current_user: dict = Depends(get_current_user)):
    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("SELECT file_path FROM videos WHERE id = %s AND user_id = %s;", (video_id, current_user["id"]))
    result = cursor.fetchone()
    cursor.close()
    connection.close()

    if not result or not os.path.exists(result[0]):
        raise HTTPException(status_code=404, detail="Video file not found")

    return FileResponse(path=result[0], media_type="video/mp4")

@router.delete("/videos/{video_id}")
def delete_video(video_id: int, current_user: dict = Depends(get_current_user)):
    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("SELECT file_path FROM videos WHERE id = %s AND user_id = %s;", (video_id, current_user["id"]))
    result = cursor.fetchone()
    
    if not result:
        cursor.close()
        connection.close()
        raise HTTPException(status_code=404, detail="Video not found")
        
    file_path = result[0]
    
    try:
        cursor.execute("DELETE FROM videos WHERE id = %s;", (video_id,))
        connection.commit()
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete video")
    finally:
        cursor.close()
        connection.close()
        
    return {"message": "Video deleted successfully"}