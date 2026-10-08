import cv2
from app.processing.video.face_analyzer import FaceAnalyzer
from app.processing.video.head_pose import HeadPoseAnalyzer
from app.processing.video.pose_analyzer import PoseAnalyzer
from app.processing.video.hand_analyzer import HandAnalyzer
from app.processing.video.visual_metrics import generate_visual_metrics
from app.utils.config import settings

def process_video_visuals(video_path):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise Exception("Could not open video file for visual analysis.")
        
    native_fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    video_duration = total_frames / native_fps if native_fps > 0 else 0
    
    # Configurable frame sampling
    target_fps = getattr(settings, 'VIDEO_ANALYSIS_FPS', 5)
    frame_skip = max(1, int(native_fps / target_fps))
    actual_fps = native_fps / frame_skip
    
    face_analyzer = FaceAnalyzer()
    head_pose = HeadPoseAnalyzer()
    pose_analyzer = PoseAnalyzer()
    hand_analyzer = HandAnalyzer()
    
    frame_results = []
    
    frame_count = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        if frame_count % frame_skip == 0:
            # MediaPipe expects RGB
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Analyze
            face_data = face_analyzer.analyze_frame(frame_rgb)
            head_data = head_pose.analyze_frame(frame_rgb)
            pose_data = pose_analyzer.analyze_frame(frame_rgb)
            hand_data = hand_analyzer.analyze_frame(frame_rgb)
            
            # Combine frame data
            frame_data = {**face_data, **head_data, **pose_data, **hand_data}
            frame_results.append(frame_data)
            
        frame_count += 1
        
    cap.release()
    face_analyzer.close()
    head_pose.close()
    pose_analyzer.close()
    hand_analyzer.close()
    
    # Generate overall metrics and events
    results = generate_visual_metrics(frame_results, actual_fps, video_duration)
    return results
