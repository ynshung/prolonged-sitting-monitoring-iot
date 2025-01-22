import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Swal from "sweetalert2";

function App() {
  const [deviceConnected, setDeviceConnected] = useState(false);

  const socketRef = useRef(null);

  let closeValue = 0;
  let farValue = 0;

  const [calibrated, setCalibrated] = useState(false);
  const [sitting, setSitting] = useState(false);
  const [lastSitChangeTime, setLastSitChangeTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [deviceAlert, setDeviceAlert] = useState(false);

  useEffect(() => {
    // Read from local storage
    socketRef.current = io(import.meta.env.VITE_API_URL);
    socketRef.current.connect();
    socketRef.current.emit("status");
    socketRef.current.emit("getCalibrateStatus");

    socketRef.current.on("calibrateStatus", (data) => {
      setCalibrated(data);
    });

    socketRef.current.on("deviceStatus", (status) => {
      setDeviceConnected(status);
    });

    socketRef.current.on("sittingStatus", (data) => {
      setSitting(data);
      if (!data) {
        setDeviceAlert(false);
        stopAlert();
      }
    });

    socketRef.current.on("lastSitChangeTime", (data) => {
      setLastSitChangeTime(data);
    });

    socketRef.current.on("alert", () => {
      setDeviceAlert(true);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    let interval;
    if (deviceConnected) {
      interval = setInterval(() => {
        const currentTime = Math.floor(Date.now() / 1000);
        const timeDiff = currentTime - lastSitChangeTime / 1000;
        setElapsedTime(timeDiff);
      }, 1000);
    } else {
      document.title = "🔴 Disconnected";
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [deviceConnected, lastSitChangeTime]);

  const stopAlert = () => {
    setDeviceAlert(false);
    socketRef.current.emit("stopAlert");
  };

  const getCalibrationValues = () => {
    // Ask user to stay in place, if confirm start calibration
    Swal.fire({
      title: "Starting Calibration",
      text: "Please stay in place on your desk.",
      icon: "info",
      showCancelButton: true,
      confirmButtonText: "Start calibration",
    }).then((result) => {
      if (result.isConfirmed) {
        // show loading spinner
        Swal.fire({
          title: "Calibrating",
          allowOutsideClick: false,
          allowEscapeKey: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        setTimeout(() => {
          socketRef.current.emit("calibrate");
        }, 1000);

        socketRef.current.once("calibrationComplete", (data) => {
          console.log(`Close value: ${data.values}`);
          closeValue = data.values;
          localStorage.setItem("closeValue", data.values);
          Swal.close();
          Swal.fire({
            title: "First Calibration Completed",
            text: `Please move away from the desk to get another reading (starts in 3 seconds).`,
            icon: "success",
            confirmButtonText: "Continue",
            showCancelButton: true,
          }).then(() => {
            if (result.isConfirmed) {
              setTimeout(() => {
                socketRef.current.emit("calibrate");
              }, 3000);

              Swal.fire({
                title: "Calibrating",
                allowOutsideClick: false,
                allowEscapeKey: false,
                didOpen: () => {
                  Swal.showLoading();
                },
              });

              socketRef.current.once("calibrationComplete", (data) => {
                console.log(`Far value: ${data.values}`);
                localStorage.setItem("farValue", data.values);
                farValue = data.values;

                socketRef.current.emit("setCalibration", {
                  closeValue: closeValue,
                  farValue: farValue,
                });

                // TODO: Show warning if values are too close

                Swal.close();
                Swal.fire({
                  title: "Calibration Completed",
                  icon: "success",
                  confirmButtonText: "Close",
                });
              });
            }
          });
        });
      }
    });
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    // update title of website
    const str = `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
    document.title = `${sitting ? "🪑" : "🧍🏻"} ${str}`;
    return str;
  };

  return (
    <div className="flex flex-col items-center justify-center gap-8">
      <div>
        Device status:{" "}
        <span className="font-bold">
          <span
            className={
              deviceConnected ? "text-green-600" : "text-red-600 animate-pulse"
            }
          >
            ● {deviceConnected ? "Connected" : "Disconnected"}
          </span>
        </span>
      </div>
      <div>
        <p>
          {sitting ? "You have been sitting for..." : "You have left for..."}
        </p>
        <p
          className={`font-bold text-8xl ${
            deviceAlert ? "dark:text-red-600 animate-pulse" : ""
          }`}
        >
          {formatTime(elapsedTime)}
        </p>
      </div>
      <span className="flex gap-4 items-center flex-col">
        {deviceAlert && (
          <button
            onClick={stopAlert}
            className="bg-orange-400 text-white px-4 py-2 rounded"
          >
            Snooze
          </button>
        )}

        {!calibrated ? (
          <button onClick={() => getCalibrationValues()}>
            Calibrate Device
          </button>
        ) : (
          <div>
            <p
              className="cursor-pointer hover:underline"
              onClick={() => getCalibrationValues()}
            >
              Recalibrate
            </p>
          </div>
        )}
      </span>
    </div>
  );
}

export default App;
