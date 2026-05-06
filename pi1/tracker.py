import time
from datetime import datetime

import cv2
import mediapipe as mp
import numpy as np

from config import SET_COUNTDOWN_SECONDS

mp_pose = mp.solutions.pose
pose = mp_pose.Pose()

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


def create_exercise_state():
    return {
        "stage": None,
        "current_reps": 0,
        "bad_reps": 0,
        "angle_data": [],
        "current_rep_angles": [],
    }


def register_rep(exercise_state, rep_quality_check):
    exercise_state["current_reps"] += 1

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


def score_form(bad_reps, total_reps):
    if total_reps <= 0:
        return None
    return max(0, 100 - bad_reps * 10)


class ManualWorkoutTracker:
    def __init__(self):
        self.cap = cv2.VideoCapture(0, cv2.CAP_V4L2)
        if not self.cap.isOpened():
            raise RuntimeError("Camera failed to open")

        self.session = None
        self.active_set = None
        self.completed_sets = []

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
        }
        print(f"Set {set_number} countdown started")

    def end_set(self):
        if self.session is None or self.active_set is None:
            raise RuntimeError("No active set to end")

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

        self.completed_sets.append(payload)
        print(f"Set {self.active_set['set_number']} ended")
        self.active_set = None
        return payload

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
                self._process_active_frame(frame)

        cv2.imshow("Tracking", frame)
        return (cv2.waitKey(1) & 0xFF) != ord("q")

    def _process_active_frame(self, frame):
        image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = pose.process(image)
        if not results.pose_landmarks:
            return

        landmarks = results.pose_landmarks.landmark
        state = self.active_set["state"]

        if self.session["exercise"] == "bicep_curl":
            update_bicep_curl_state(state, detect_bicep_curl_angle(landmarks))
        elif self.session["exercise"] == "squat":
            update_squat_state(state, detect_squat_angle(landmarks))

    def close(self):
        self.cap.release()
        cv2.destroyAllWindows()
