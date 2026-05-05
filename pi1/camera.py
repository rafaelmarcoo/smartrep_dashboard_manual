# ----------- IMPORTS -----------
import cv2
import mediapipe as mp
import numpy as np
import time
import json
from datetime import datetime
import paho.mqtt.client as mqtt
from openai import OpenAI
from config import OPENAI_API_KEY, TB_BROKER, TB_PORT, TB_PI2_TOKEN

mqtt_client = mqtt.Client()
mqtt_client.username_pw_set(TB_PI2_TOKEN)
mqtt_client.connect(TB_BROKER, TB_PORT, 60)

# ----------- OPENAI SETUP -----------
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# ----------- MEDIAPIPE SETUP -----------
mp_pose = mp.solutions.pose
pose = mp_pose.Pose()
mp_drawing = mp.solutions.drawing_utils

# ----------- SESSION STORAGE -----------
session_data = {
    "exercise": "bicep_curl",
    "sets": 0,
    "reps_per_set": [],
    "form_scores": [],
    "events": [],
    "start_time": None,
    "end_time": None
}

current_reps = 0
stage = None
set_start_time = None


# ----------- HELPER FUNCTIONS -----------

def calculate_angle(a, b, c):
    a, b, c = np.array(a), np.array(b), np.array(c)
    ba, bc = a - b, c - b
    angle = np.arccos(
        np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc))
    )
    return np.degrees(angle)


def publish(payload):
    mqtt_client.publish("v1/devices/me/telemetry", json.dumps(payload))


# ----------- TRACKING PHASE (NO GPT HERE) -----------

def track_workout():
    global current_reps, stage, set_start_time

    cap = cv2.VideoCapture(0)

    session_data["start_time"] = datetime.utcnow().isoformat()
    set_start_time = time.time()

    last_rep_time = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = pose.process(image)

        if results.pose_landmarks:
            landmarks = results.pose_landmarks.landmark

            # Example: Bicep Curl (Right Arm)
            shoulder = [landmarks[12].x, landmarks[12].y]
            elbow = [landmarks[14].x, landmarks[14].y]
            wrist = [landmarks[16].x, landmarks[16].y]

            angle = calculate_angle(shoulder, elbow, wrist)

            # Rep detection
            if angle < 50:
                stage = "up"

            if angle > 150 and stage == "up":
                stage = "down"
                current_reps += 1
                last_rep_time = time.time()

                # Store rep event
                session_data["events"].append({
                    "type": "rep",
                    "timestamp": datetime.utcnow().isoformat(),
                    "angle": angle
                })

        # ---- SET DETECTION ----
        if time.time() - last_rep_time > 20 and current_reps > 0:
            session_data["sets"] += 1
            session_data["reps_per_set"].append(current_reps)

            session_data["events"].append({
                "type": "set_complete",
                "timestamp": datetime.utcnow().isoformat(),
                "reps": current_reps
            })

            current_reps = 0
            last_rep_time = time.time()

        # ---- EXIT CONDITION (simulate session end) ----
        if cv2.waitKey(10) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

    session_data["end_time"] = datetime.utcnow().isoformat()


# ----------- AI COACHING (ONLY AFTER WORKOUT) -----------

def generate_coaching():
    avg_form = 84  # placeholder (replace with computed value)

    prompt = f"""
    Exercise: {session_data['exercise']}
    Sets: {session_data['sets']}
    Reps: {session_data['reps_per_set']}
    Avg form score: {avg_form}/100
    """

    response = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a gym coach. Give concise, encouraging feedback in 3-4 sentences."},
            {"role": "user", "content": prompt}
        ]
    )

    coaching_text = response.choices[0].message.content

    return coaching_text


# ----------- POST-WORKOUT PIPELINE -----------

def post_workout():
    coaching = generate_coaching()

    payload = {
        "event": "session_complete",
        "exercise": session_data["exercise"],
        "sets": session_data["sets"],
        "reps_per_set": session_data["reps_per_set"],
        "start_time": session_data["start_time"],
        "end_time": session_data["end_time"],
        "coaching_summary": coaching
    }

    publish(payload)

    print("Coaching Summary:")
    print(coaching)


# ----------- MAIN -----------

if __name__ == "__main__":
    track_workout()     # Phase 1: collect data (NO GPT)
    post_workout()      # Phase 2: call GPT + publish
