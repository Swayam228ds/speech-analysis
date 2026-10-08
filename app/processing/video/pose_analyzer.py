import mediapipe as mp
import numpy as np

class PoseAnalyzer:
    def __init__(self):
        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)
        self.prev_landmarks = None

    def analyze_frame(self, frame_rgb):
        results = self.pose.process(frame_rgb)
        
        body_movement = False
        posture_shift = False
        
        if results.pose_landmarks:
            landmarks = results.pose_landmarks.landmark
            current_positions = np.array([[lm.x, lm.y, lm.z] for lm in landmarks])
            
            if self.prev_landmarks is not None:
                # Calculate movement magnitude across shoulders (11, 12) and hips (23, 24)
                core_indices = [11, 12, 23, 24]
                diff = current_positions[core_indices] - self.prev_landmarks[core_indices]
                movement_magnitude = np.mean(np.linalg.norm(diff, axis=1))
                
                if movement_magnitude > 0.01:
                    body_movement = True
                if movement_magnitude > 0.03:
                    posture_shift = True
                    
            self.prev_landmarks = current_positions
            
        return {
            "body_movement": body_movement,
            "posture_shift": posture_shift
        }
        
    def close(self):
        self.pose.close()
