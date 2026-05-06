import threading
import time
from datetime import datetime

import RPi.GPIO as GPIO

from adc import read_adc
from config import AVAILABLE, CHANNEL, CHAIR, EQUIPMENT, OCCUPIED, SLEEP_TIME, THRESHOLD
from led import setup_leds, update_led
from mqtt_client import configure as configure_mqtt
from mqtt_client import publish, shutdown as shutdown_mqtt
from session_manager import SessionManager
from tracker import track_workout

log_lock = threading.Lock()

setup_leds(EQUIPMENT)
session_mgr = SessionManager()


def workout_thread():
    track_workout(session_mgr)


def sensor_led_thread():
    try:
        while True:
            overall_state = {}

            for name, eq in EQUIPMENT.items():
                value = read_adc(eq[CHANNEL])

                if name == CHAIR:
                    available = value < eq[THRESHOLD]
                else:
                    available = value > eq[THRESHOLD]

                update_led(eq, available)
                overall_state[name] = AVAILABLE if available else OCCUPIED

                log("GYM EQUIPMENT", f"{name}: {overall_state[name]}")

            publish(overall_state)

            print("-" * 30)
            time.sleep(SLEEP_TIME)

    finally:
        GPIO.cleanup()
        shutdown_mqtt()


def main():
    configure_mqtt(command_handler=session_mgr.handle_command)

    t1 = threading.Thread(target=workout_thread)
    t2 = threading.Thread(target=sensor_led_thread)

    t1.start()
    t2.start()

    t1.join()
    t2.join()


def log(source, message):
    with log_lock:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [{source}] {message}")


if __name__ == "__main__":
    main()
