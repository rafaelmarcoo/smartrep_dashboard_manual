from openai import OpenAI
from config import OPENAI_API_KEY
from datetime import datetime
import threading

client = OpenAI(api_key=OPENAI_API_KEY)
log_lock = threading.Lock()

def generate_coaching(session_data):

    prompt = f"""
    You are a gym coach.

    Evaluate the user's performance based on angle data.

    Exercise: {session_data['exercise']}
    Sets: {session_data['sets']}
    Total reps: {session_data['reps_per_set']}

    Per-rep angle summary:
    {session_data['angle_data']}

    Interpretation:
    - Lower min angle = better contraction
    - Higher max angle = better extension
    - Consistency across reps matters

    Give 3–4 sentences of feedback:
    - Comment on range of motion
    - Consistency
    - Fatigue trends
    - Give improvement advice
    """

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a gym coach. Give concise, encouraging feedback in 3-4 sentences."},
            {"role": "user", "content": prompt}
        ]
    )

    log("AI COACHING", response.choices[0].message.content)
    return response.choices[0].message.content


def log(source, message):
    with log_lock:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [{source}] {message}")
