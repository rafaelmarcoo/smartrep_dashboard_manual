import threading
from datetime import datetime

from openai import OpenAI

from config import OPENAI_API_KEY

client = OpenAI(api_key=OPENAI_API_KEY)
log_lock = threading.Lock()


def generate_set_coaching(set_data):
    prompt = f"""
    You are a gym coach.

    Evaluate this single workout set.

    Exercise: {set_data['exercise']}
    Set number: {set_data['set_number']}
    Reps: {set_data['reps']}
    Bad reps: {set_data['bad_reps']}
    Form score: {set_data['form_score']}

    Per-rep angle summary:
    {set_data['angle_data']}

    Give 2-3 short sentences:
    - Comment on range of motion
    - Point out consistency or fatigue
    - Give one actionable cue for the next set
    """

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": "You are a gym coach. Give concise, encouraging feedback in 2-3 sentences.",
            },
            {"role": "user", "content": prompt},
        ],
    )

    coaching = response.choices[0].message.content
    log("AI COACHING", coaching)
    return coaching


def generate_session_coaching(session_data):
    prompt = f"""
    You are a gym coach.

    Evaluate the full workout session based on the completed sets.

    Exercise: {session_data['exercise']}
    Sets: {session_data['sets']}
    Reps per set: {session_data['reps_per_set']}
    Bad reps: {session_data['bad_reps']}
    Form score: {session_data['form_score']}

    Per-set angle summary:
    {session_data['angle_data']}

    Interpretation:
    - Lower min angle = better contraction
    - Higher max angle = better extension
    - Consistency across reps matters

    Give 3-4 sentences of feedback:
    - Comment on range of motion
    - Consistency across the workout
    - Fatigue trends
    - Give improvement advice for the next session
    """

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": "You are a gym coach. Give concise, encouraging feedback in 3-4 sentences.",
            },
            {"role": "user", "content": prompt},
        ],
    )

    coaching = response.choices[0].message.content
    log("AI COACHING", coaching)
    return coaching


def generate_coaching(session_data):
    return generate_session_coaching(session_data)


def log(source, message):
    with log_lock:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [{source}] {message}")
