import time
from datetime import datetime

import cv2
import mediapipe as mp
import numpy as np

from ai_coach import generate_coaching
from config import SESSION_ID, START_TIME
from mqtt_client import publish

mp_pose = mp.solutions.pose
pose = mp_pose.Pose()

SUPPORTED_EXERCISES = ("bicep_curl", "squat")


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


def create_empty_session_data(session):
    return {
        "session_id": session[SESSION_ID],
        "exercise": "unknown",
        "sets": 0,
        "reps_per_set": [],
        "bad_reps": 0,
        "form_score": None,
        "angle_data": [],
        # The sensor loop is the source of truth for when the shared
        # dumbbell session started, so the camera reuses that timestamp.
        "start_time": session[START_TIME].isoformat(),
        "end_time": None,
    }


def create_exercise_state():
    return {
        "stage": None,
        "current_reps": 0,
        "sets": 0,
        "reps_per_set": [],
        "bad_reps": 0,
        "angle_data": [],
        "current_rep_angles": [],
        "rep_events": 0,
        "motion_score": 0,
        "target_reached_logged": False,
    }


def finalize_set(exercise_state):
    if exercise_state["current_reps"] <= 0:
        return

    exercise_state["sets"] += 1
    exercise_state["reps_per_set"].append(exercise_state["current_reps"])
    exercise_state["current_reps"] = 0


def register_rep(exercise_state, rep_quality_check):
    exercise_state["current_reps"] += 1
    exercise_state["rep_events"] += 1

    rep_summary = {
        "rep": exercise_state["current_reps"],
        "min": min(exercise_state["current_rep_angles"]),
        "max": max(exercise_state["current_rep_angles"]),
    }
    exercise_state["angle_data"].append(rep_summary)
    exercise_state["current_rep_angles"] = []

    if not rep_quality_check(rep_summary):
        exercise_state["bad_reps"] += 1

    print(f"Rep: {exercise_state['current_reps']}")


def update_bicep_curl_state(exercise_state, angle):
    exercise_state["current_rep_angles"].append(angle)

    if angle > 145:
        exercise_state["stage"] = "down"
        exercise_state["motion_score"] += 1

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
        exercise_state["motion_score"] += 1

    if angle < 95 and exercise_state["stage"] == "up":
        exercise_state["stage"] = "down"
        register_rep(
            exercise_state,
            lambda rep_summary: rep_summary["min"] <= 105 and rep_summary["max"] >= 145,
        )


def maybe_finalize_target_set(exercise_name, exercise_state, reps_per_set_target):
    if exercise_state["current_reps"] >= reps_per_set_target:
        finalize_set(exercise_state)
        print(f"{exercise_name} set {exercise_state['sets']} completed")


def choose_dominant_exercise(exercise_states):
    # We only support curls and squats for now, so choose the one with the
    # clearest rep pattern. Motion score is the fallback when no reps landed.
    ranked = sorted(
        SUPPORTED_EXERCISES,
        key=lambda exercise_name: (
            exercise_states[exercise_name]["rep_events"],
            exercise_states[exercise_name]["motion_score"],
        ),
        reverse=True,
    )
    return ranked[0]


def build_session_summary(session_data, chosen_exercise, exercise_state):
    finalize_set(exercise_state)

    session_data["exercise"] = chosen_exercise
    session_data["sets"] = exercise_state["sets"]
    session_data["reps_per_set"] = exercise_state["reps_per_set"]
    session_data["bad_reps"] = exercise_state["bad_reps"]
    session_data["angle_data"] = exercise_state["angle_data"]
    session_data["form_score"] = max(0, 100 - exercise_state["bad_reps"] * 10)

    return session_data


def build_workout_payload(session_data, coaching_summary):
    return {
        # This event reuses the shared dumbbell session id instead of
        # creating a second camera-only session.
        "event": "session_complete",
        "session_id": session_data["session_id"],
        "exercise": session_data["exercise"],
        "sets": session_data["sets"],
        "reps_per_set": session_data["reps_per_set"],
        "bad_reps": session_data["bad_reps"],
        "form_score": session_data["form_score"],
        "start_time": session_data["start_time"],
        "end_time": session_data["end_time"],
        "coaching_summary": coaching_summary,
    }


def initialize_session_tracking(session):
    exercise_states = {
        "bicep_curl": create_exercise_state(),
        "squat": create_exercise_state(),
    }
    return create_empty_session_data(session), exercise_states


def track_workout(session_manager):
    max_sets = 3
    reps_per_set_target = 12
    active_session_id = None
    session_data = None
    exercise_states = None
    locked_exercise = None
    cap = cv2.VideoCapture(0, cv2.CAP_V4L2)

    if not cap.isOpened():
        raise RuntimeError("Camera failed to open")

    try:
        while True:
            session = session_manager.get_active_session()
            ret, frame = cap.read()

            if not ret:
                print("Camera read failed")
                time.sleep(0.1)
                continue

            if session is None:
                if active_session_id is not None and session_data is not None and exercise_states is not None:
                    chosen_exercise = locked_exercise or choose_dominant_exercise(exercise_states)
                    session_data = build_session_summary(
                        session_data,
                        chosen_exercise,
                        exercise_states[chosen_exercise],
                    )
                    session_data["end_time"] = datetime.utcnow().isoformat()

                    coaching = generate_coaching(session_data)
                    publish(build_workout_payload(session_data, coaching))

                    print("Shared workout session complete")

                    active_session_id = None
                    session_data = None
                    exercise_states = None
                    locked_exercise = None

                cv2.imshow("Tracking", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
                time.sleep(0.1)
                continue

            if session[SESSION_ID] != active_session_id:
                active_session_id = session[SESSION_ID]
                session_data, exercise_states = initialize_session_tracking(session)
                locked_exercise = None

                # The tracker does not mint session ids anymore.
                # It joins the active dumbbell session that sensors opened.
                print(f"Tracking shared session: {active_session_id}")

            image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose.process(image)

            if results.pose_landmarks and session_data is not None and exercise_states is not None:
                landmarks = results.pose_landmarks.landmark
                curl_angle = detect_bicep_curl_angle(landmarks)
                squat_angle = detect_squat_angle(landmarks)

                update_bicep_curl_state(exercise_states["bicep_curl"], curl_angle)
                update_squat_state(exercise_states["squat"], squat_angle)

                if locked_exercise is None:
                    chosen_exercise = choose_dominant_exercise(exercise_states)
                    chosen_state = exercise_states[chosen_exercise]

                    # We lock onto the first exercise that shows a clear
                    # movement pattern so one dumbbell session maps to one
                    # workout type in the telemetry.
                    if chosen_state["rep_events"] >= 2:
                        locked_exercise = chosen_exercise
                        session_data["exercise"] = chosen_exercise
                        print(f"Detected exercise: {chosen_exercise}")

                active_exercise = locked_exercise or choose_dominant_exercise(exercise_states)
                active_state = exercise_states[active_exercise]

                maybe_finalize_target_set(
                    active_exercise,
                    active_state,
                    reps_per_set_target,
                )

                if active_state["sets"] >= max_sets and not active_state["target_reached_logged"]:
                    print("Workout set target reached; waiting for dumbbells to return")
                    active_state["target_reached_logged"] = True

            cv2.imshow("Tracking", frame)

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    finally:
        cap.release()
        cv2.destroyAllWindows()
