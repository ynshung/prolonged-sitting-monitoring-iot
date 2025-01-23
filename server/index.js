import mqtt from "mqtt";
import https from "https";
import fs from "fs";
import { Server } from "socket.io";
import { MongoClient } from "mongodb";
import "dotenv/config";

// Constants
const sslOptions = {
  key: fs.readFileSync('./certs/private.key'),
  cert: fs.readFileSync('./certs/certificate.pem'),
};

const ALERT_TIME  = 30 * 60 * 1000; // 20 minutes
const SNOOZE_TIME =  5 * 60 * 1000; // 5 minutes
const CALIBRATION_TIME = 5 * 1000;
const DEVICE_TIMEOUT = 3 * 1000;
const HISTORY_SIZE = 10;
const HISTORY_THRESHOLD = 8;

if (HISTORY_SIZE < HISTORY_THRESHOLD) {
  throw new Error(
    "HISTORY_SIZE must be greater than or equal to HISTORY_THRESHOLD"
  );
}

// WS
const server = https.createServer(sslOptions);

var io = new Server(server, {
  cors: {
    origin: "https://psm.ynshung.com",
    methods: ["GET", "POST"],
  },
});

// MQTT
const protocol = "mqtt";
const host = process.env.MQTT_HOST;
const port = "1883";
const clientId = `mqtt_${Math.random().toString(16).slice(3)}`;

const connectUrl = `${protocol}://${host}:${port}`;

const client = mqtt.connect(connectUrl, {
  clientId,
  clean: true,
  connectTimeout: 4000,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  reconnectPeriod: 1000,
});

// DB
const dbURL = process.env.DB_URL;
const dbClient = new MongoClient(dbURL);
const db = dbClient.db("db");
const sittingHistory = db.collection("sittingHistory");

// State
let deviceConnected = false;
let lastDeviceHeartbeat = 0;

let calibrating = false;
let calibrationStartTimestamp = 0;
let calibrationValues = [];

let distanceHistory = [];

let currentSitting = false;
let lastSitChangeTime = Date.now();

let alertStopped = 0;
let emittedAlert = false;

// Initialization
// Read from DB the last sitting status
sittingHistory
  .find({ userId: "default" })
  .sort({ timestamp: -1 })
  .limit(1)
  .toArray()
  .then((data) => {
    if (data.length > 0) {
      currentSitting = data[0].sitting;
      lastSitChangeTime = data[0].timestamp;
    }
  });

// Functions

const updateDistanceHistory = (distance) => {
  distanceHistory.unshift(distance);
  if (distanceHistory.length > 512) {
    distanceHistory.pop();
  }
};

let cachedCalibrationValue = null;
let lastCalibrationFetch = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

const getAverageCalibrationValue = async () => {
  const now = Date.now();
  if (cachedCalibrationValue && now - lastCalibrationFetch < CACHE_DURATION) {
    return cachedCalibrationValue;
  }

  try {
    const userPreferences = db.collection("userPreferences");
    const data = await userPreferences.findOne({ userId: "default" });
    if (data) {
      cachedCalibrationValue = (data.closeValue + data.farValue) / 2;
      lastCalibrationFetch = now;
      return cachedCalibrationValue;
    } else {
      return 0;
    }
  } catch (error) {
    console.error(error);
    return -1;
  }
};

const checkSitting = async () => {
  const data = await getAverageCalibrationValue();
  if (data <= 0) {
    return false;
  }

  const sittingValues = distanceHistory.slice(0, HISTORY_SIZE);
  const sittingCount = sittingValues.filter((value) => value < data).length;
  const nonSittingCount = sittingValues.filter((value) => value >= data).length;
  if (sittingCount >= HISTORY_THRESHOLD) {
    return true;
  } else if (nonSittingCount >= HISTORY_THRESHOLD) {
    emittedAlert = false;
    alertStopped = 0;
    return false;
  } else {
    return currentSitting;
  }
};

const changeSittingPhase = (sitting) => {
  currentSitting = sitting;
  sittingHistory.insertOne({
    userId: "default",
    timestamp: Date.now(),
    sitting: sitting,
  });
  sittingHistory.findOneAndUpdate(
    { userId: "default" },
    { $set: { length: Date.now() - lastSitChangeTime } },
    { sort: { timestamp: -1 } }
  );
  lastSitChangeTime = Date.now();

  io.emit("sittingStatus", sitting);
  io.emit("lastSitChangeTime", lastSitChangeTime);
  syncDeviceTime();
};

const syncDeviceTime = () => {
  const timeDifference = Math.floor(Date.now() - lastSitChangeTime - 1000);
  client.publish("syncTime", timeDifference.toString());
}

setInterval(() => {
  if (deviceConnected && Date.now() - lastDeviceHeartbeat > DEVICE_TIMEOUT) {
    console.log("Device disconnected");
    deviceConnected = false;
    io.emit("deviceStatus", false);
  }

  // Check if time exceeds alert time
  if ((alertStopped === 0 || Date.now() - alertStopped > SNOOZE_TIME) && currentSitting && Date.now() - lastSitChangeTime > ALERT_TIME) {
    io.emit("alert");
    client.publish("startBuzz");
    emittedAlert = true;
  }
}, 500);

// MQTT

client.on("connect", () => {
  console.log("Connected");
  syncDeviceTime();

  client.subscribe("deviceDistance", (err) => {
    if (!err) {
      console.log("Subscribed to deviceDistance");
    }
  });
});

client.on("message", (topic, message) => {
  if (topic === "deviceDistance") {
    lastDeviceHeartbeat = Date.now();
    if (!deviceConnected) {
      console.log("Device connected");
      deviceConnected = true;
      io.emit("deviceStatus", true);
      client.publish("lastSitChangeTime", lastSitChangeTime.toString());
      syncDeviceTime();
    }

    const distance = parseFloat(message.toString());
    updateDistanceHistory(distance);
    checkSitting()
      .then((isSitting) => {
        if (isSitting !== currentSitting) {
          changeSittingPhase(isSitting);
        }
      })
      .catch((error) => {
        console.error("Error checking sitting status:", error);
      });

    if (calibrating) {
      calibrationValues.push(distance);
      if (Date.now() - calibrationStartTimestamp > CALIBRATION_TIME) {
        calibrating = false;
        const averageDistance =
          calibrationValues.reduce((a, b) => a + b, 0) /
          calibrationValues.length;
        io.emit("calibrationComplete", { values: averageDistance });
      }
    }
  }
});

// WS

io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("calibrate", () => {
    console.log("Calibrating");
    calibrationValues = [];
    calibrating = true;
    calibrationStartTimestamp = Date.now();
  });

  socket.on("status", () => {
    socket.emit("deviceStatus", deviceConnected);
    socket.emit("sittingStatus", currentSitting);
    socket.emit("lastSitChangeTime", lastSitChangeTime);
  });

  socket.on("subscribe", ({ min, max }) => {
    client.publish("subscribe", JSON.stringify({ min, max }));
  });

  socket.on("getCalibrateStatus", async () => {
    const data = await getAverageCalibrationValue();
    socket.emit("calibrateStatus", data > 0);
  });

  socket.on("setCalibration", (data) => {
    try {
      const userPreferences = db.collection("userPreferences");
      userPreferences.updateOne(
        { userId: "default" },
        { $set: { closeValue: data.closeValue, farValue: data.farValue } },
        { upsert: true }
      );
      cachedCalibrationValue = null;
    } catch (error) {
      console.error(error);
    }
  });

  socket.on("stopAlert", () => {
    alertStopped = Date.now();
    client.publish("stopBuzz");
  });
});

server.listen(443, () => {
  console.log("Socket.io running on port 443");
});
