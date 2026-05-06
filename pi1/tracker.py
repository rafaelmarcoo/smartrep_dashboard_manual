import time
from datetime import datetime

import cv2
import mediapipe as mp
import numpy as np

from ai_coach import generate_session_coaching, generate_set_coaching
from config import END_TIME, SESSION_ID, START_TIME
from workout_contract import (
    EXERCISE_BICEP_CURL,
    EXERCISE_SQUAT,
    FIELD_EXERCISE,
    FIELD_SET_NUMBER,
    WORKOUT_STATE_SET_ACTIVE,
)

mp_pose = mp.solutions.pose
pose = mp_pose.Pose()


def calculate_angle(a, b, c):
    a = np.array(a)
    b = np.array(b)
    c = np.array(c)

    ba = a - b
    bc = c - b

    cosine_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc))
    cosine_angle = np.clip(cosine_angle, -1.0, 1.0)
    angle = np.degrees(np.arccos(cosine_angle))
    return angle


def get_point(landmarks, pose_landmark):
    landmark = landmarks[pose_landmark.value]
    return [landmark.x, landmark.y]


def get_average_angle(landmarks, left_triplet, right_triplet):
    left_angle = calculate_angle(
        get_point(landmarks, left_triplet[0]),
        get_point(landmarks, left_triplet[1]),
        get_point(landmarks, left_triplet[2]),
    )
    right_angle = calculate_angle(
        get_point(landmarks, right_triplet[0]),
        get_point(landmarks, right_triplet[1]),
        get_point(landmarks, right_triplet[2]),
    )
    return (left_angle + right_angle) / 2


def detect_bicep_curl_angle(landmarks):
    return get_average_angle(
        landmarks,
        (
            mp_pose.PoseLandmark.LEFT_SHOULDER,
            mp_pose.PoseLandmark.LEFT_ELBOW,
            mp_pose.PoseLandmark.LEFT_WRIST,
        ),
        (
            mp_pose.PoseLandmark.RIGHT_SHOULDER,
            mp_pose.PoseLandmark.RIGHT_ELBOW,
            mp_pose.PoseLandmark.RIGHT_WRIST,
        ),
    )


def detect_squat_angle(landmarks):
    return get_average_angle(
        landmarks,
        (
            mp_pose.PoseLandmark.LEFT_HIP,
            mp_pose.PoseLandmark.LEFT_KNEE,
            mp_pose.PoseLandmark.LEFT_ANKLE,
        ),
        (
            mp_pose.PoseLandmark.RIGHT_HIP,
            mp_pose.PoseLandmark.RIGHT_KNEE,
            mp_pose.PoseLandmark.RIGHT_ANKLE,
        ),
    )


def create_set_state():
    return {
        "stage": None,
        "reps": 0,
        "bad_reps": 0,
        "angle_data": [],
        "current_rep_angles": [],
    }


def register_rep(exercise_state, rep_quality_check):
    exercise_state["reps"] += 1

    rep_summary = {
        "rep": exercise_state["reps"],
        "min": min(exercise_state["current_rep_angles"]),
        "max": max(exercise_state["current_rep_angles"]),
    }
    exercise_state["angle_data"].append(rep_summary)
    exercise_state["current_rep_angles"] = []

    if not rep_quality_check(rep_summary):
        exercise_state["bad_reps"] += 1

    print(f"Rep: {exercise_state['reps']}")


def update_bicep_curl_state(exercise_state, angle):
    exercise_state["current_rep_angles"].append(angle)

    if angle > 145:
        exercise_state["stage"] = "down"

    if angle < 55 and exercise_state["stage"] == "down":
        exercise_state["stage"] = "up"
        register_rep(
            exercise_state,
            lambda rep_summary: rep_summary["min"] <= 70 and rep_summary["max"] >= 140,
        )


def update_squat_state(exercise_state, angle):
    exercise_state["current_rep_angles"].append(angle)

    if angle > 155:
        exercise_state["stage"] = "up"

    if angle < 95 and exercise_state["stage"] == "up":
        exercise_state["stage"] = "down"
        register_rep(
            exercise_state,
            lambda rep_summary: rep_summary["min"] <= 105 and rep_summary["max"] >= 145,
        )


def build_set_summary(session_snapshot, set_state):
    started_at = session_snapshot["current_set_started_at"] or datetime.utcnow()
    ended_at = datetime.utcnow()

    return {
        "session_id": session_snapshot["session_id"],
        "exercise": session_snapshot["exercise"],
        "set_number": session_snapshot["current_set_number"],
        "reps": set_state["reps"],
        "bad_reps": set_state["bad_reps"],
        "form_score": max(0, 100 - set_state["bad_reps"] * 10),
        "angle_data": set_state["angle_data"],
        START_TIME: started_at.isoformat(),
        END_TIME: ended_at.isoformat(),
    }


def build_session_summary(session_snapshot, coaching_summary):
    completed_sets = session_snapshot["completed_sets"]
    reps_per_set = [set_row["reps"] for set_row in completed_sets]
    form_scores = [
        set_row["form_score"]
        for set_row in completed_sets
        if set_row["form_score"] is not None
    ]

    return {
        "session_id": session_snapshot["session_id"],
        "exercise": session_snapshot["exercise"],
        "sets": len(completed_sets),
        "reps_per_set": reps_per_set,
        "bad_reps": sum(set_row["bad_reps"] for set_row in completed_sets),
        "form_score": round(sum(form_scores) / len(form_scores), 2) if form_scores else None,
        "angle_data": [
            {
                "set_number": set_row["set_number"],
                "angle_data": set_row["angle_data"],
            }
            for set_row in completed_sets
        ],
        "coaching_summary": coaching_summary,
        START_TIME: session_snapshot["session_start_time"].isoformat(),
        END_TIME: datetime.utcnow().isoformat(),
    }


def track_workout(session_manager):
    cap = cv2.VideoCapture(0, cv2.CAP_V4L2)
    active_set_key = None
    set_state = None

    if not cap.isOpened():
        raise RuntimeError("Camera failed to open")

    try:
        while True:
            session_manager.activate_ready_set_if_due()
            session = session_manager.get_workout_snapshot()
            ret, frame = cap.read()

            if not ret:
                print("Camera read failed")
                time.sleep(0.1)
                continue

            if session_manager.should_finalize_session():
                completed_snapshot = session_manager.get_workout_snapshot()
                if completed_snapshot is not None:
                    final_coaching = (
                        generate_session_coaching(
                            build_session_summary(completed_snapshot, coaching_summary=None)
                        )
                        if completed_snapshot["completed_sets"]
                        else "No completed sets were captured during this session."
                    )
                    session_manager.complete_session(
                        build_session_summary(completed_snapshot, final_coaching)
                    )
                active_set_key = None
                set_state = None
                session = session_manager.get_workout_snapshot()

            if session is None or session["state"] != WORKOUT_STATE_SET_ACTIVE:
                active_set_key = None
                set_state = None
                cv2.imshow("Tracking", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
                time.sleep(0.1)
                continue

            current_set_key = (session[SESSION_ID], session[FIELD_SET_NUMBER])
            if current_set_key != active_set_key:
                active_set_key = current_set_key
                set_state = create_set_state()
                print(
                    f"Tracking session {session[SESSION_ID]} set {session[FIELD_SET_NUMBER]} "
                    f"for {session[FIELD_EXERCISE]}"
                )

            image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose.process(image)

            if results.pose_landmarks and set_state is not None:
                landmarks = results.pose_landmarks.landmark

                if session[FIELD_EXERCISE] == EXERCISE_BICEP_CURL:
                    curl_angle = detect_bicep_curl_angle(landmarks)
                    update_bicep_curl_state(set_state, curl_angle)
                elif session[FIELD_EXERCISE] == EXERCISE_SQUAT:
                    squat_angle = detect_squat_angle(landmarks)
                    update_squat_state(set_state, squat_angle)

            if session["end_set_requested"] and set_state is not None:
                completed_set = build_set_summary(session, set_state)
                completed_set["coaching_summary"] = generate_set_coaching(completed_set)
                session_manager.complete_active_set(completed_set)
                active_set_key = None
                set_state = None

            cv2.imshow("Tracking", frame)

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    finally:
        cap.release()
        cv2.destroyAllWindows()
