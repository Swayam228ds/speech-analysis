import cv2
import mediapipe as mp

class FaceAnalyzer:
    def __init__(self):
        self.mp_face_detection = mp.solutions.face_detection
        self.face_detection = self.mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5)

    def analyze_frame(self, frame_rgb):
        results = self.face_detection.process(frame_rgb)
        
        face_detected = False
        num_faces = 0
        
        if results.detections:
            face_detected = True
            num_faces = len(results.detections)
            
        return {
            "face_detected": face_detected,
            "num_faces": num_faces
        }
        
    def close(self):
        self.face_detection.close()
