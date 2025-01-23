# IoT Prolonged Sitting Monitoring

A simple IoT project to monitor user's prolonged sitting at a desk.

The project consists of a web application that displays the user's sitting time and a hardware device that detects the user's presence. Once the user has been sitting for a prolonged period, the buzzer will notify the user to stand up from the desk.

## Specifications

### IoT Hardware
- IoT Board with WiFi capabilities (e.g. ESP32)
- SR04 Ultrasonic Ranging Sensor
- Buzzer (optional)
- 4-digit 7-segment display (optional)
- Other components that can be used (e.g. LEDs, buttons)

### UI & Software
- Mosquitto MQTT Broker
- Express.js Server
- MongoDB Database
- React.js Frontend

## Setup

* Server
  * `.env` with the following variables: `MQTT_HOST`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `DB_URL`.
  * Certificates for HTTPS in the `certs` folder.
* Client: `.env` with the following variables: `VITE_API_URL`.
* Hardware: `secrets.h` with the following variables: `WIFI_SSID`, `WIFI_PASSWORD`, `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD`.

