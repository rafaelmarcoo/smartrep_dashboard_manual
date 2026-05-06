import paho.mqtt.client as mqtt
import json
from config import TB_BROKER, TB_PORT, TB_PI1_TOKEN, MQTT_TOPIC

client = mqtt.Client()
client.username_pw_set(TB_PI1_TOKEN)
client.connect(TB_BROKER, TB_PORT, 60)


def publish(payload):
    client.publish(MQTT_TOPIC, json.dumps(payload))

