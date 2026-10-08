def generate_visual_metrics(frame_results, fps, video_duration):
    if not frame_results:
        return {"metrics": {}, "events": []}

    total_frames = len(frame_results)
    
    face_visible_frames = 0
    looking_away_frames = 0
    body_movement_frames = 0
    hand_movement_frames = 0
    posture_shift_count = 0
    
    events = []
    
    # State trackers for events
    state = {
        "LOOKING_AWAY": {"active": False, "start": 0},
        "HAND_MOVEMENT": {"active": False, "start": 0},
        "FACE_NOT_DETECTED": {"active": False, "start": 0},
    }
    
    def trigger_event(event_type, end_time):
        start_time = state[event_type]["start"]
        duration = end_time - start_time
        if duration > 0.5: # Minimum duration to log an event
            events.append({
                "type": event_type,
                "start": round(start_time, 2),
                "end": round(end_time, 2),
                "duration": round(duration, 2)
            })
        state[event_type]["active"] = False

    for i, res in enumerate(frame_results):
        timestamp = i / fps
        
        # Face Visibility
        if res["face_detected"]:
            face_visible_frames += 1
            if state["FACE_NOT_DETECTED"]["active"]:
                trigger_event("FACE_NOT_DETECTED", timestamp)
        else:
            if not state["FACE_NOT_DETECTED"]["active"]:
                state["FACE_NOT_DETECTED"] = {"active": True, "start": timestamp}
                
        # Looking Away
        if res["looking_away"]:
            looking_away_frames += 1
            if not state["LOOKING_AWAY"]["active"]:
                state["LOOKING_AWAY"] = {"active": True, "start": timestamp}
        else:
            if state["LOOKING_AWAY"]["active"]:
                trigger_event("LOOKING_AWAY", timestamp)
                
        # Body / Posture
        if res["body_movement"]:
            body_movement_frames += 1
        if res["posture_shift"]:
            posture_shift_count += 1
            
        # Hand Movement
        if res["hand_movement"]:
            hand_movement_frames += 1
            if not state["HAND_MOVEMENT"]["active"]:
                state["HAND_MOVEMENT"] = {"active": True, "start": timestamp}
        else:
            if state["HAND_MOVEMENT"]["active"]:
                trigger_event("HAND_MOVEMENT", timestamp)

    # Close any active events at the end of the video
    for evt, evt_state in state.items():
        if evt_state["active"]:
            trigger_event(evt, video_duration)

    metrics = {
        "face_visibility_ratio": round(face_visible_frames / total_frames, 2),
        "camera_facing_ratio": round(1.0 - (looking_away_frames / total_frames), 2),
        "head_movement_count": 0, # Could be calculated based on yaw/pitch variance
        "body_movement_ratio": round(body_movement_frames / total_frames, 2),
        "hand_activity_ratio": round(hand_movement_frames / total_frames, 2),
        "posture_change_count": posture_shift_count
    }

    return {
        "metrics": metrics,
        "events": events
    }
