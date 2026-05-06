import threading
import time
from datetime import datetime

import RPi.GPIO as GPIO

from adc import read_adc
from config import AVAILABLE, CHANNEL, CHAIR, EQUIPMENT, OCCUPIED, SLEEP_TIME, THRESHOLD
from control_loop import run_control_loop
from led import setup_leds, update_led
from mqtt_client import publish

log_lock = threading.Lock()

setup_leds(EQUIPMENT)


def workout_thread():
    run_control_loop()


def sensor_led_thread():
    try:
        while True:
            equipment_states = {}
            overall_state = {}

            for name, eq in EQUIPMENT.items():
                value = read_adc(eq[CHANNEL])

                if name == CHAIR:
                    available = value < eq[THRESHOLD]
                else:
                    available = value > eq[THRESHOLD]

                # Chair and foam roller are status-only sensors.
                # We still publish their availability, but only the dumbbell
                # pair participates in workout session start/end.
                # The LEDs and availability telemetry still stay per-equipment.
                # Only the session lifecycle is unified at the dumbbell-pair level.
                update_led(eq, not available)
                equipment_states[name] = available
                overall_state[name] = AVAILABLE if available else OCCUPIED

                log("GYM EQUIPMENT", f"{name}: {overall_state[name]}")

            publish(overall_state)

            print("-" * 30)
            time.sleep(SLEEP_TIME)

    finally:
        GPIO.cleanup()


def main():
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
