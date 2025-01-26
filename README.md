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
- Mosquitto MQTT Broker: Communication between IoT board and server
- MongoDB Database: Storage of sitting history database
- Socket.IO Server: WebSockets communication with client web app
- React.js Frontend: Front-end web app

## Setup

### Prerequisites
* Install `TM1637` (Avishay), `PubSubClient` (Nick), `floatToString` (Ted) and `EspMQTTClient` (Patrick) on Arduino IDE before compiling.
* Server must have MQTT broker, MongoDB database and Node.js installed

### Environment Variables
* Server
  * `.env` with the following variables: `MQTT_HOST`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `DB_URL`.
  * Certificates for HTTPS in the `certs` folder.
* Client: `.env` with the following variables: `VITE_API_URL`.
* Hardware: `secrets.h` with the following variables: `WIFI_SSID`, `WIFI_PASSWORD`, `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD`.

### Development
* Configure the pin, add or remove components if necessary, compile and upload the hardware code to the IoT board.
* `npm i` and `npm run dev` in the `server` and `client` folders.

