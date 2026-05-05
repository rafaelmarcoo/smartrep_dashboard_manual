import RPi.GPIO as GPIO

def setup_leds(equipment):
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)

    for eq in equipment.values():
        GPIO.setup(eq["led_green"], GPIO.OUT)
        GPIO.setup(eq["led_red"], GPIO.OUT)


def update_led(eq, occupied):
    GPIO.output(eq["led_green"], not occupied)
    GPIO.output(eq["led_red"], occupied)