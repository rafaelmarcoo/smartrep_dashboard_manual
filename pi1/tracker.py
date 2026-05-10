import time
from datetime import datetime

import cv2
import mediapipe as mp
import numpy as np

from config import (
    CAMERA_BUFFER_SIZE,
    CAMERA_FPS,
    CAMERA_HEIGHT,
    CAMERA_INDEX,
    CAMERA_WIDTH,
    POSE_PROCESS_EVERY_N_FRAMES,
    SET_COUNTDOWN_SECONDS,
)

mp_pose = mp.solutions.pose
pose = mp_pose.Pose(
    model_complexity=0,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)

SUPPORTED_EXERCISES = ("bicep_curl", "squat")


def calculate_angle(a, b, c):
    a = np.array(a)
    b = np.array(b)
    c = np.array(c)

    ba = a - b
    bc = c - b

    denominator = np.linalg.norm(ba) * np.linalg.norm(bc)
    if denominator == 0:
        return 0

    cosine_angle = np.dot(ba, bc) / denominator
    cosine_angle = np.clip(cosine_angle, -1.0, 1.0)
    angle = np.degrees(np.arccos(cosine_angle))
    return angle


def get_point(landmarks, pose_landmark):
    landmark = landmarks[pose_landmark.value]
    return [landmark.x, landmark.y]


def get_landmark(landmarks, pose_landmark):
    landmark = landmarks[pose_landmark.value]
    return {
        "x": landmark.x,
        "y": landmark.y,
        "visibility": landmark.visibility,
    }


def get_triplet_visibility(landmarks, triplet):
    return sum(landmarks[item.value].visibility for item in triplet) / len(triplet)


def get_best_visible_angle(landmarks, left_triplet, right_triplet):
    left_visibility = get_triplet_visibility(landmarks, left_triplet)
    right_visibility = get_triplet_visibility(landmarks, right_triplet)

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

    if abs(left_visibility - right_visibility) < 0.15:
        return (left_angle + right_angle) / 2

    return left_angle if left_visibility > right_visibility else right_angle


def get_side_metrics(landmarks, side):
    prefix = "LEFT" if side == "left" else "RIGHT"
    points = {
        "shoulder": getattr(mp_pose.PoseLandmark, f"{prefix}_SHOULDER"),
        "elbow": getattr(mp_pose.PoseLandmark, f"{prefix}_ELBOW"),
        "wrist": getattr(mp_pose.PoseLandmark, f"{prefix}_WRIST"),
        "hip": getattr(mp_pose.PoseLandmark, f"{prefix}_HIP"),
        "knee": getattr(mp_pose.PoseLandmark, f"{prefix}_KNEE"),
        "ankle": getattr(mp_pose.PoseLandmark, f"{prefix}_ANKLE"),
    }
    values = {name: get_landmark(landmarks, point) for name, point in points.items()}

    return {
        "elbow_angle": calculate_angle(
            [values["shoulder"]["x"], values["shoulder"]["y"]],
            [values["elbow"]["x"], values["elbow"]["y"]],
            [values["wrist"]["x"], values["wrist"]["y"]],
        ),
        "knee_angle": calculate_angle(
            [values["hip"]["x"], values["hip"]["y"]],
            [values["knee"]["x"], values["knee"]["y"]],
            [values["ankle"]["x"], values["ankle"]["y"]],
        ),
        "elbow_forward_drift": values["elbow"]["x"] - values["shoulder"]["x"],
        "knee_forward_drift": values["knee"]["x"] - values["ankle"]["x"],
        "torso_lean": abs(values["shoulder"]["x"] - values["hip"]["x"]),
        "visibility": sum(item["visibility"] for item in values.values()) / len(values),
    }


def get_best_side_metrics(landmarks):
    left = get_side_metrics(landmarks, "left")
    right = get_side_metrics(landmarks, "right")
    return left if left["visibility"] >= right["visibility"] else right


def detect_bicep_curl_angle(landmarks):
    return get_best_visible_angle(
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
    return get_best_visible_angle(
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


def create_exercise_state():
    return {
        "stage": None,
        "current_reps": 0,
        "bad_reps": 0,
        "angle_data": [],
        "current_rep_angles": [],
        "current_rep_metrics": [],
    }


def summarize_metrics(exercise, rep_metrics):
    if not rep_metrics:
        return {}

    if exercise == "bicep_curl":
        elbow_drift_values = [abs(item["elbow_forward_drift"]) for item in rep_metrics]
        return {
            "max_elbow_drift": max(elbow_drift_values),
        }

    if exercise == "squat":
        torso_values = [item["torso_lean"] for item in rep_metrics]
        knee_drift_values = [abs(item["knee_forward_drift"]) for item in rep_metrics]
        return {
            "max_torso_lean": max(torso_values),
            "max_knee_drift": max(knee_drift_values),
        }

    return {}


def register_rep(exercise_state, exercise, rep_quality_check):
    exercise_state["current_reps"] += 1

    metric_summary = summarize_metrics(exercise, exercise_state["current_rep_metrics"])
    rep_summary = {
        "rep": exercise_state["current_reps"],
        "min_angle": round(min(exercise_state["current_rep_angles"]), 1),
        "max_angle": round(max(exercise_state["current_rep_angles"]), 1),
        **{key: round(value, 3) for key, value in metric_summary.items()},
    }

    issues = rep_quality_check(rep_summary)
    rep_summary["issues"] = issues
    exercise_state["angle_data"].append(rep_summary)
    exercise_state["current_rep_angles"] = []
    exercise_state["current_rep_metrics"] = []

    if issues:
        exercise_state["bad_reps"] += 1

    print(f"Rep: {exercise_state['current_reps']}")


def check_bicep_curl_quality(rep_summary):
    issues = []
    if rep_summary["min_angle"] > 70:
        issues.append("not enough curl contraction")
    if rep_summary["max_angle"] < 140:
        issues.append("not enough arm extension")
    if rep_summary.get("max_elbow_drift", 0) > 0.08:
        issues.append("elbow drifting during curl")
    return issues


def check_squat_quality(rep_summary):
    issues = []
    if rep_summary["min_angle"] > 105:
        issues.append("squat depth too shallow")
    if rep_summary["max_angle"] < 145:
        issues.append("not fully standing between reps")
    if rep_summary.get("max_torso_lean", 0) > 0.18:
        issues.append("torso leaning forward")
    if rep_summary.get("max_knee_drift", 0) > 0.18:
        issues.append("knee tracking drifting")
    return issues


def update_bicep_curl_state(exercise_state, angle, metrics):
    exercise_state["current_rep_angles"].append(angle)
    exercise_state["current_rep_metrics"].append(metrics)

    if angle > 145:
        exercise_state["stage"] = "down"

    if angle < 90 and exercise_state["stage"] == "down":
        exercise_state["stage"] = "up"
        register_rep(exercise_state, "bicep_curl", check_bicep_curl_quality)


def update_squat_state(exercise_state, angle, metrics):
    exercise_state["current_rep_angles"].append(angle)
    exercise_state["current_rep_metrics"].append(metrics)

    if angle > 155:
        exercise_state["stage"] = "up"

    if angle < 115 and exercise_state["stage"] == "up":
        exercise_state["stage"] = "down"
        register_rep(exercise_state, "squat", check_squat_quality)


def score_form(bad_reps, total_reps):
    if total_reps <= 0:
        return None
    return max(0, 100 - bad_reps * 10)


class ManualWorkoutTracker:
    def __init__(self):
        self.cap = cv2.VideoCapture(CAMERA_INDEX, cv2.CAP_V4L2)
        if not self.cap.isOpened():
            raise RuntimeError("Camera failed to open")

        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
        self.cap.set(cv2.CAP_PROP_FPS, CAMERA_FPS)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, CAMERA_BUFFER_SIZE)

        self.session = None
        self.active_set = None
        self.completed_sets = []
        self.frame_number = 0
        self.last_overlay_text = ""

    def start_session(self, session_id, exercise, started_at=None):
        if exercise not in SUPPORTED_EXERCISES:
            raise ValueError(f"Unsupported exercise: {exercise}")

        self.session = {
            "external_session_id": session_id,
            "exercise": exercise,
            "started_at": started_at or datetime.utcnow().isoformat(),
        }
        self.active_set = None
        self.completed_sets = []
        print(f"Manual workout session started: {session_id} ({exercise})")

    def start_set(self, external_set_id, set_number):
        if self.session is None:
            raise RuntimeError("Cannot start a set without an active session")
        if self.active_set is not None:
            raise RuntimeError("A set is already active")

        self.active_set = {
            "external_set_id": external_set_id,
            "set_number": set_number,
            "state": create_exercise_state(),
            "status": "countdown",
            "countdown_until": time.time() + SET_COUNTDOWN_SECONDS,
            "started_at": None,
            "completed_payload": None,
        }
        print(f"Set {set_number} countdown started")

    def end_set(self):
        if self.session is None or self.active_set is None:
            raise RuntimeError("No active set to end")

        if self.active_set["completed_payload"] is not None:
            print(f"Retrying set {self.active_set['set_number']} completion post")
            return self.active_set["completed_payload"]

        state = self.active_set["state"]
        reps = state["current_reps"]
        bad_reps = state["bad_reps"]
        ended_at = datetime.utcnow().isoformat()

        payload = {
            "external_session_id": self.session["external_session_id"],
            "external_set_id": self.active_set["external_set_id"],
            "set_number": self.active_set["set_number"],
            "exercise": self.session["exercise"],
            "reps": reps,
            "bad_reps": bad_reps,
            "form_score": score_form(bad_reps, reps),
            "angle_data": state["angle_data"],
            "started_at": self.active_set["started_at"],
            "ended_at": ended_at,
        }

        self.active_set["status"] = "processing_feedback"
        self.active_set["completed_payload"] = payload
        print(f"Set {self.active_set['set_number']} ended")
        return payload

    def confirm_set_completed(self):
        if self.active_set is None or self.active_set["completed_payload"] is None:
            return

        payload = self.active_set["completed_payload"]
        self.completed_sets.append(payload)
        print(f"Set {self.active_set['set_number']} feedback posted")
        self.active_set = None

    def end_session(self):
        if self.session is None:
            raise RuntimeError("No active session to end")
        if self.active_set is not None:
            raise RuntimeError("End the active set before ending the session")

        total_bad_reps = sum(item["bad_reps"] or 0 for item in self.completed_sets)
        scored_sets = [
            item["form_score"] for item in self.completed_sets if item["form_score"] is not None
        ]
        average_score = (
            round(sum(scored_sets) / len(scored_sets), 1) if scored_sets else None
        )
        payload = {
            "external_session_id": self.session["external_session_id"],
            "exercise": self.session["exercise"],
            "sets": len(self.completed_sets),
            "reps_per_set": [item["reps"] for item in self.completed_sets],
            "bad_reps": total_bad_reps,
            "form_score": average_score,
            "started_at": self.session["started_at"],
            "ended_at": datetime.utcnow().isoformat(),
        }

        print(f"Manual workout session ended: {self.session['external_session_id']}")
        self.session = None
        self.active_set = None
        self.completed_sets = []
        return payload

    def cancel_session(self):
        self.session = None
        self.active_set = None
        self.completed_sets = []
        print("Manual workout session cancelled")

    def tick(self, status_callback=None):
        self.frame_number += 1
        ret, frame = self.cap.read()
        if not ret:
            print("Camera read failed")
            time.sleep(0.1)
            return True

        if self.session is not None and self.active_set is not None:
            if self.active_set["status"] == "countdown":
                remaining = self.active_set["countdown_until"] - time.time()
                if remaining <= 0:
                    started_at = datetime.utcnow().isoformat()
                    self.active_set["status"] = "active"
                    self.active_set["started_at"] = started_at
                    if status_callback is not None:
                        status_callback(
                            self.active_set["external_set_id"],
                            "active",
                            started_at,
                        )
                    print(f"Set {self.active_set['set_number']} active")
                else:
                    cv2.putText(
                        frame,
                        str(max(1, int(np.ceil(remaining)))),
                        (40, 90),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        2,
                        (0, 255, 255),
                        4,
                    )

            if self.active_set is not None and self.active_set["status"] == "active":
                should_process_pose = self.frame_number % POSE_PROCESS_EVERY_N_FRAMES == 0
                if should_process_pose:
                    self._process_active_frame(frame)
                elif self.last_overlay_text:
                    self._draw_overlay(frame, self.last_overlay_text)

        cv2.imshow("Tracking", frame)
        return (cv2.waitKey(1) & 0xFF) != ord("q")

    def _process_active_frame(self, frame):
        image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image.flags.writeable = False
        results = pose.process(image)
        if not results.pose_landmarks:
            return

        landmarks = results.pose_landmarks.landmark
        state = self.active_set["state"]
        metrics = get_best_side_metrics(landmarks)

        if self.session["exercise"] == "bicep_curl":
            angle = detect_bicep_curl_angle(landmarks)
            update_bicep_curl_state(state, angle, metrics)
        elif self.session["exercise"] == "squat":
            angle = detect_squat_angle(landmarks)
            update_squat_state(state, angle, metrics)
        else:
            return

        self.last_overlay_text = (
            f"Reps: {state['current_reps']} Angle: {angle:.0f} Stage: {state['stage'] or '-'}"
        )
        self._draw_overlay(frame, self.last_overlay_text)

    def _draw_overlay(self, frame, text):
        cv2.putText(
            frame,
            text,
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2,
        )

    def close(self):
        self.cap.release()
        cv2.destroyAllWindows()
