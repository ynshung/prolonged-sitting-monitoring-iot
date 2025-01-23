#include <PubSubClient.h>
#include <WiFi.h>
#include <floatToString.h>
#include <TM1637Display.h>
#include "secrets.h"

const char* MQTT_TOPIC = "iot";  // MQTT topic for subscription
const int MQTT_PORT = 1883;

const int buzzerPin = 26;
// Ultrasonic sensor
const int trigPin = 12;
const int echoPin = 14;
// Digit display
const int clkPin = 32;
const int dioPin = 33;

TM1637Display display(clkPin, dioPin);

const int updateInterval = 250;
unsigned long lastUpdate = 0;

bool isBuzzing = false;
unsigned long prevBuzz = 0;
int buzzerState = LOW;
const unsigned long onDuration = 1000;
const unsigned long offDuration = 300;

unsigned long lastTimeSync = 0;
unsigned long stopwatchTime = 0;

void callback(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, "startBuzz") == 0) {
    isBuzzing = true;
  }
  if (strcmp(topic, "stopBuzz") == 0) {
    isBuzzing = false;
    noTone(buzzerPin);
  }
  if (strcmp(topic, "syncTime") == 0) {
    payload[length] = '\0';
    stopwatchTime = atol((char*)payload);
    lastTimeSync = millis();
  }
}

WiFiClient espClient;
PubSubClient client(MQTT_SERVER, MQTT_PORT, callback, espClient);

void setupWifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  delay(10);
}

void setup() {
  Serial.begin(115200);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(buzzerPin, OUTPUT);

  display.setBrightness(4);
  setupWifi();
}

float getDistance() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  float duration = pulseIn(echoPin, HIGH);
  float distanceCm = duration * 0.034 / 2;
  return distanceCm;
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    if (client.connect("esp32", MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println("Server connected");
      client.subscribe("startBuzz");
      client.subscribe("stopBuzz");
      client.subscribe("syncTime");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }

  unsigned long cur = millis();
  if (cur - lastUpdate > updateInterval) {
    lastUpdate = cur;
    float distance = getDistance();
    char str[15];
    floatToString(distance, str, sizeof(str), 8);
    client.publish("deviceDistance", str);

    unsigned long sitDuration = stopwatchTime + cur - lastTimeSync;
    unsigned long minutes = sitDuration / 60000;
    unsigned long seconds = (sitDuration % 60000) / 1000;
    display.showNumberDecEx(minutes * 100 + seconds, 0b11100000, true);
  }
  if (isBuzzing) {
    if (buzzerState == HIGH && cur - prevBuzz >= onDuration) {
      // Turn buzzer OFF
      buzzerState = LOW;
      prevBuzz = cur;
      tone(buzzerPin, 512);
    } else if (buzzerState == LOW && cur - prevBuzz >= offDuration) {
      // Turn buzzer ON
      buzzerState = HIGH;
      prevBuzz = cur;
      noTone(buzzerPin);
    }
  }

  client.loop();
}
