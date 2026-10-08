import mediapipe as mp
import numpy as np

class HandAnalyzer:
    def __init__(self):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(min_detection_confidence=0.5, min_tracking_confidence=0.5)
        self.prev_landmarks = None

    def analyze_frame(self, frame_rgb):
        results = self.hands.process(frame_rgb)
        
        hand_movement = False
        
        if results.multi_hand_landmarks:
            # We track the wrist (0) and index finger mcp (5) for overall movement
            current_positions = []
            for hand_landmarks in results.multi_hand_landmarks:
                current_positions.append([hand_landmarks.landmark[0].x, hand_landmarks.landmark[0].y])
                current_positions.append([hand_landmarks.landmark[5].x, hand_landmarks.landmark[5].y])
                
            current_positions = np.array(current_positions)
            
            if self.prev_landmarks is not None:
                # Because hands might appear/disappear, we just calculate average movement of visible hands
                min_len = min(len(self.prev_landmarks), len(current_positions))
                if min_len > 0:
                    diff = current_positions[:min_len] - self.prev_landmarks[:min_len]
                    movement_magnitude = np.mean(np.linalg.norm(diff, axis=1))
                    
                    # Threshold for significant hand gesture activity
                    if movement_magnitude > 0.02:
                        hand_movement = True
                        
            self.prev_landmarks = current_positions
        else:
            self.prev_landmarks = None
            
        return {
            "hand_movement": hand_movement
        }
        
    def close(self):
        self.hands.close()
