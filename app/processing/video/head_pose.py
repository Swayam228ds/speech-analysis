import cv2
import mediapipe as mp
import numpy as np
import math

class HeadPoseAnalyzer:
    def __init__(self):
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        # 3D model points of a standard face
        self.model_points = np.array([
            (0.0, 0.0, 0.0),             # Nose tip
            (0.0, -330.0, -65.0),        # Chin
            (-225.0, 170.0, -135.0),     # Left eye left corner
            (225.0, 170.0, -135.0),      # Right eye right corner
            (-150.0, -150.0, -125.0),    # Left Mouth corner
            (150.0, -150.0, -125.0)      # Right mouth corner
        ], dtype=np.float64)

    def analyze_frame(self, frame_rgb):
        img_h, img_w, _ = frame_rgb.shape
        results = self.face_mesh.process(frame_rgb)
        
        looking_away = False
        pitch, yaw, roll = 0.0, 0.0, 0.0
        
        if results.multi_face_landmarks:
            face_landmarks = results.multi_face_landmarks[0]
            
            # Extract 2D points
            image_points = np.array([
                (face_landmarks.landmark[1].x * img_w, face_landmarks.landmark[1].y * img_h),       # Nose tip
                (face_landmarks.landmark[152].x * img_w, face_landmarks.landmark[152].y * img_h),     # Chin
                (face_landmarks.landmark[226].x * img_w, face_landmarks.landmark[226].y * img_h),     # Left eye
                (face_landmarks.landmark[446].x * img_w, face_landmarks.landmark[446].y * img_h),     # Right eye
                (face_landmarks.landmark[57].x * img_w, face_landmarks.landmark[57].y * img_h),       # Left mouth
                (face_landmarks.landmark[287].x * img_w, face_landmarks.landmark[287].y * img_h)      # Right mouth
            ], dtype=np.float64)

            # Camera internals
            focal_length = img_w
            center = (img_w / 2, img_h / 2)
            camera_matrix = np.array(
                [[focal_length, 0, center[0]],
                 [0, focal_length, center[1]],
                 [0, 0, 1]], dtype=np.float64
            )
            dist_coeffs = np.zeros((4, 1))

            success, rotation_vector, translation_vector = cv2.solvePnP(
                self.model_points, image_points, camera_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE
            )

            if success:
                rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
                proj_matrix = np.hstack((rotation_matrix, translation_vector))
                eulerAngles = cv2.decomposeProjectionMatrix(proj_matrix)[6]
                
                pitch, yaw, roll = [math.degrees(math.asin(math.sin(math.radians(x)))) for x in eulerAngles]
                
                # Simple heuristic for looking away (thresholds can be adjusted)
                if abs(yaw) > 25 or abs(pitch) > 20:
                    looking_away = True
                    
        return {
            "yaw": yaw,
            "pitch": pitch,
            "roll": roll,
            "looking_away": looking_away
        }
        
    def close(self):
        self.face_mesh.close()
