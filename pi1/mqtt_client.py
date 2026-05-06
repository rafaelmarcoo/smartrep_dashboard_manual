import json
import threading

import paho.mqtt.client as mqtt

from config import MQTT_TOPIC, TB_BROKER, TB_PI1_TOKEN, TB_PORT

RPC_REQUEST_TOPIC = "v1/devices/me/rpc/request/+"
RPC_RESPONSE_TOPIC_PREFIX = "v1/devices/me/rpc/response/"

client = mqtt.Client()
client.username_pw_set(TB_PI1_TOKEN)

_command_handler = None
_connect_lock = threading.Lock()
_loop_started = False


def _ensure_connected():
    global _loop_started

    with _connect_lock:
        if _loop_started:
            return

        client.connect(TB_BROKER, TB_PORT, 60)
        client.loop_start()
        _loop_started = True


def _on_connect(_client, _userdata, _flags, _rc):
    if _command_handler is not None:
        client.subscribe(RPC_REQUEST_TOPIC)


def _on_message(_client, _userdata, message):
    if _command_handler is None:
        return

    try:
        body = json.loads(message.payload.decode("utf-8"))
    except json.JSONDecodeError:
        return

    method = body.get("method")
    params = body.get("params") or {}
    request_id = message.topic.rsplit("/", 1)[-1]
    response = _command_handler(method, params)

    if request_id and response is not None:
        client.publish(
            f"{RPC_RESPONSE_TOPIC_PREFIX}{request_id}",
            json.dumps(response),
        )


client.on_connect = _on_connect
client.on_message = _on_message


def configure(command_handler=None):
    global _command_handler
    _command_handler = command_handler
    _ensure_connected()


def publish(payload):
    _ensure_connected()
    client.publish(MQTT_TOPIC, json.dumps(payload))


def shutdown():
    global _loop_started

    with _connect_lock:
        if not _loop_started:
            return

        client.loop_stop()
        client.disconnect()
        _loop_started = False
