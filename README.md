# Hospital Chemical Dosing IoT - Implementation

This workspace contains both the report generator and simulation artifacts for the hospital disinfectant dosing system.

For the full explanation of how the Wokwi simulation works, including computational methods and test scenarios, see `SIMULATION_GUIDE.md`.

## Wokwi Simulation

Open the project folder in Wokwi or the Wokwi VS Code extension. The main Wokwi files are:

- `diagram.json` - ESP32 wiring for the simulated dosing system.
- `wokwi.toml` - Wokwi VS Code simulator configuration.
- `platformio.ini` - PlatformIO ESP32 build configuration for local simulation.
- `src/main.cpp` - PlatformIO entry point for building the same firmware.
- `sketch.ino` - Wokwi entry file.
- `firmware/esp32_sim.ino` - full ESP32 simulation logic.
- `libraries.txt` - LCD dependency used by the Wokwi sketch.

The Wokwi circuit models the report flow:

- HC-SR04 ultrasonic sensor: external purified-water level gauge.
- Potentiometer `chemWeight`: external chemical-container weight/load-cell estimate.
- Potentiometers `waterFlow` and `chemFlow`: measured flow-meter feedback.
- Three tank low-level slide switches: one low-level sensor per dispensing tank.
- Three tank valve LEDs: sequential outlet valves for Ward-A, ICU, and Theatre.
- Water valve LED, chemical pump PWM LED, and mix/transfer pump LED.
- Alarm LED and buzzer for leak, blocked valve, dry supply, timeout, or level faults.
- LCD gauge showing water, chemical, queue, PPM, and active dispensing state.

### Serial Monitor Test Commands

Start the simulation and open Serial Monitor at `115200` baud. Type:

The simulation has auto-demo enabled, so manual typing is optional. After the ESP32 starts, wait about 5 seconds and it will automatically queue Ward-A, ICU, and Theatre for FIFO refilling.

```text
help
low1
low2
low3
all
waterlow
chemlow
leak
block
dry
clearfaults
reset
status
report
```

Useful test paths:

- `low1` starts a refill for Ward-A.
- `all` queues all three tanks and serves them FIFO, one at a time.
- `waterlow` followed by `low1` tests low purified-water rejection/alarm.
- `chemlow` followed by `low1` tests concentrated chemical low-level handling.
- `block` followed by `low1` tests blocked valve detection.
- `dry` followed by `low1` tests dry water supply/no-flow detection.
- `leak` immediately tests leak alarm handling.
- `report` prints tank-by-tank refill count, mixed volume, and chemical usage.

The flow-rate potentiometers are intentionally independent from the PWM output LED, showing the report requirement that PWM command does not guarantee real pump flow and the controller must use measured flow feedback.

### Running in Wokwi for VS Code

Wokwi for VS Code runs compiled firmware, so build first:

```bash
pio run
```

Then open `diagram.json`, press `Ctrl+Shift+P`, and run:

```text
Wokwi: Start Simulator
```

The `wokwi.toml` file points Wokwi to PlatformIO's generated ESP32 firmware at `.pio/build/esp32doit-devkit-v1/firmware.bin` and `.pio/build/esp32doit-devkit-v1/firmware.elf`.

If you do not have PlatformIO installed, the easiest path is the Wokwi browser editor: create a new **ESP32 Arduino** project, paste `sketch.ino`, paste `diagram.json`, add the `LiquidCrystal I2C` library, and press Play.

Do not use the ESP-IDF template for this project. If the Wokwi project contains a `main.c` file with `app_main`, delete that file or start again from an ESP32 Arduino template. Otherwise the Arduino core and ESP-IDF `main.c` both define `app_main`, which causes a `multiple definition of app_main` build error.

## Node MQTT Simulation

The earlier Node.js simulation remains available:

```bash
npm install
npm start
npm run simulate -- 01 --request
```

- `controller/index.js` starts an embedded MQTT broker and queue controller.
- `controller/simulation_client.js` simulates a remote tank node.
- `generateReport.js` regenerates the Word report.
