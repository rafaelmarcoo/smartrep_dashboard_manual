import os

# MQTT
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
TB_PI1_TOKEN = os.getenv("TB_PI1_TOKEN", "")
TB_PI2_TOKEN = os.getenv("TB_PI2_TOKEN", "")
TB_BROKER = os.getenv("TB_BROKER", "mqtt.thingsboard.cloud")
TB_PORT = int(os.getenv("TB_PORT", "1883"))
MQTT_TOPIC = "v1/devices/me/telemetry"

# Dashboard / Supabase command control
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
PI_DEVICE_ID = os.getenv("PI_DEVICE_ID", "SmartRep-Pi1")
DASHBOARD_API_BASE_URL = os.getenv("DASHBOARD_API_BASE_URL", "http://localhost:3000")
COMMAND_POLL_SECONDS = float(os.getenv("COMMAND_POLL_SECONDS", "0.35"))
SET_COUNTDOWN_SECONDS = int(os.getenv("SET_COUNTDOWN_SECONDS", "3"))

# Camera / pose tracking
CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))
CAMERA_WIDTH = int(os.getenv("CAMERA_WIDTH", "640"))
CAMERA_HEIGHT = int(os.getenv("CAMERA_HEIGHT", "480"))
CAMERA_FPS = int(os.getenv("CAMERA_FPS", "30"))
CAMERA_BUFFER_SIZE = int(os.getenv("CAMERA_BUFFER_SIZE", "1"))
CAMERA_FOURCC = os.getenv("CAMERA_FOURCC", "MJPG")
POSE_FRAME_WIDTH = int(os.getenv("POSE_FRAME_WIDTH", "320"))
POSE_PROCESS_EVERY_N_FRAMES = max(1, int(os.getenv("POSE_PROCESS_EVERY_N_FRAMES", "2")))

#Equipment Name
DUMBBELL_LEFT = "dumbbell_left"
DUMBBELL_RIGHT = "dumbbell_right"
DUMBBELL_PAIR = "dumbbell_pair"
FOAM_ROLLER = "foam_roller"
CHAIR = "chair"

#Equipment Attributes
CHANNEL = "channel"
THRESHOLD = "threshold"
LED_GREEN = "led_green"
LED_RED = "led_red"

#Equipment Status
AVAILABLE = "available"
OCCUPIED = "occupied"

#Session Variables
EVENT = "event"
EQUIPMENT_NAME = "equipment"
SESSION_ID = "session_id"
START_TIME = "start_time"
END_TIME = "end_time"
SESSION_DURATION = "session_duration_s"

# PCF8591
PCF_ADDRESS = 0x48

#Sleep Time
SLEEP_TIME = 0.5

# Equipment mapping
EQUIPMENT = {
    DUMBBELL_LEFT: {CHANNEL: 0, THRESHOLD: 100, LED_GREEN: 18, LED_RED: 17},
    DUMBBELL_RIGHT: {CHANNEL: 1, THRESHOLD: 100, LED_GREEN: 27, LED_RED: 22},
    FOAM_ROLLER: {CHANNEL: 2, THRESHOLD: 100, LED_GREEN: 24, LED_RED: 23},
    CHAIR: {CHANNEL: 3, THRESHOLD: 100, LED_GREEN: 5, LED_RED: 6},
}
