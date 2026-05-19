# Hospital Chemical Dosing IoT Wokwi Simulation Guide

## 1. Purpose of the Simulation

This Wokwi simulation demonstrates the IoT control logic for an automated hospital disinfectant dosing system. The simulated system follows the process flow in the project report:

For a focused explanation of each visible potentiometer, LED, buzzer, and slide switch, see `WOKWI_CONTROLS_GUIDE.md`.

1. Purified water is stored in a main supply tank.
2. Concentrated chemical is stored in a separate chemical container.
3. Water and chemical are measured through flow feedback.
4. The liquids are mixed to create the required diluted disinfectant concentration.
5. The mixed liquid is sent to one dispensing tank at a time.
6. If multiple dispensing tanks request refilling, they are served using a first-request-first-serve queue.
7. Abnormal conditions trigger visual and audible alarms.
8. Usage data is collected and printed as a simple report.

The simulation is intended to prove the control algorithm, sensor interpretation, queue handling, fault detection, and reporting logic. It is not a full fluid dynamics model.

## 2. Main Simulation Files

- `diagram.json`  
  Defines the Wokwi visual circuit and all component connections.

- `sketch.ino`  
  Main Wokwi Arduino sketch used in the browser editor.

- `firmware/esp32_sim.ino`  
  Same simulation firmware kept inside the firmware folder for project organization.

- `libraries.txt`  
  Adds the `LiquidCrystal I2C` library required by the LCD.

- `wokwi.toml`  
  Used only when running the simulation from Wokwi for VS Code. It points Wokwi to compiled PlatformIO firmware.

- `platformio.ini` and `src/main.cpp`  
  Used to build the ESP32 firmware locally for Wokwi VS Code.

## 3. Simulated Components

| Real System Component | Wokwi Component Used | Purpose |
|---|---|---|
| ESP32 controller | ESP32 DevKit V1 | Main controller |
| External ultrasonic water level sensor | HC-SR04 + `waterLevel` potentiometer | Shows the external sensor and gives an adjustable water-level input for the demo |
| Chemical tank load-cell platform | Potentiometer `chemWeight` | Represents external chemical weight/remaining volume |
| Water flow meter | Potentiometer `waterFlow` | Represents actual measured water flow |
| Chemical flow meter | Potentiometer `chemFlow` | Represents actual measured chemical flow |
| Dispensing tank low-level sensors | Slide switches `tank1Low`, `tank2Low`, `tank3Low` | Trigger refill requests |
| Water solenoid valve | Blue LED `waterValveLed` | Shows water valve open/closed |
| Chemical pump PWM output | Yellow LED `chemPumpLed` | Shows chemical pump command |
| Mixing/transfer pump | Cyan LED `mixPumpLed` | Shows transfer to dispensing line |
| Tank inlet valves | Green LEDs | Shows which dispensing tank is active |
| Digital gauge | I2C LCD | Displays water level, chemical level, queue, and refill progress |
| Audible/visual alarm | Buzzer + red LED | Fault warning |
| Leak/block/dry fault inputs | Slide switches | Manual abnormal-condition injection |

## 4. How the Simulation Works

When the ESP32 starts, the system enters the `IDLE` state. In this state, the LCD shows the current purified water level, estimated chemical level, target PPM, and refill queue length.

Auto-demo mode is currently enabled. This means that after about 5 seconds, the simulation automatically queues all three dispensing tanks and starts a FIFO refill demonstration. You can simply press Play/Start and watch the LEDs and LCD without typing anything into the Serial Monitor.

A dispensing tank can request a refill in two ways:

1. Toggle one of the tank low-level switches in the visual circuit.
2. Type a command in the Serial Monitor, such as `low1`, `low2`, or `low3`.
3. Wait for the built-in auto-demo to queue the tanks automatically.

When a tank requests refilling, the controller adds it to a FIFO queue. If the system is idle, it performs safety checks and starts refilling the first tank in the queue.

During a refill:

1. The water valve LED turns on.
2. The chemical pump PWM LED turns on.
3. The mixing/transfer pump LED turns on.
4. Only the selected tank valve LED turns on.
5. Water and chemical flow values are read from the flow potentiometers.
6. The controller integrates measured flow over time to estimate dispensed volume.
7. Once the target volume is reached, all actuator LEDs turn off and the system moves to the next queued tank.

Only one dispensing tank can be filled at a time.

## 5. Computational Methods Used

### 5.1 Water Level Calculation

The purified water tank cannot have sensors installed inside it. The simulation uses an HC-SR04 ultrasonic sensor to represent an externally mounted non-contact level sensor.

The measured distance is converted into water height:

```text
water_height = tank_height - measured_distance
```

Then the water height is scaled into litres:

```text
water_volume_litres = (water_height / tank_height) * tank_capacity_litres
```

In the simulation:

```text
tank_capacity = 2000 L
tank_height = 400 cm simulation scale
```

The real report discusses a cylindrical tank calculation using:

```text
volume = pi * radius^2 * height
```

The Wokwi simulation uses a scaled height-to-volume model because it is easier to control visually with the HC-SR04 component.

### 5.2 Chemical Remaining Estimation

The real project requirement says no level sensor can be installed inside the chemical container. The simulation uses two external/computational methods:

1. External load-cell estimate  
   The `chemWeight` potentiometer represents the output of a load-cell platform under the 10 L chemical container.

2. Flow integration estimate  
   The controller subtracts the total measured chemical used from the starting estimate.

The computational estimate is:

```text
chemical_remaining = initial_chemical_estimate - total_chemical_used
```

If the load-cell estimate and flow-integrated estimate differ by more than 10%, the simulation prints:

```text
Chemical load/flow estimate mismatch
```

This represents possible leakage, sensor drift, wrong container replacement, or flow measurement error. In the current demo firmware this is a warning instead of an immediate alarm so accidental potentiometer movement does not stop the whole demonstration.

### 5.3 Dilution Ratio and PPM Calculation

The simulation assumes:

```text
concentrated chemical = 100000 PPM
target disinfectant = 1000 PPM
target refill volume = 500 mL
```

The required chemical fraction is:

```text
chemical_fraction = target_ppm / concentrate_ppm
```

So:

```text
chemical_fraction = 1000 / 100000 = 0.01
```

For a 500 mL refill:

```text
chemical_volume = 500 * 0.01 = 5 mL
water_volume = 500 - 5 = 495 mL
```

The code therefore doses approximately:

```text
495 mL water
5 mL concentrated chemical
```

This demonstrates proportional dosing based on target concentration.

### 5.4 Flow Integration

PWM is used to command the chemical pump, but PWM does not guarantee actual flow. Therefore, the controller uses measured flow feedback.

In each loop:

```text
dispensed_volume = dispensed_volume + flow_rate * time_step
```

For water:

```text
water_dosed_ml += water_flow_ml_per_second * dt
```

For chemical:

```text
chemical_dosed_ml += chemical_flow_ml_per_second * dt
```

This is numerical integration over time. It is one of the most important computational parts of the simulation.

### 5.5 FIFO Refill Queue

Only one dispensing tank may be refilled at a time. The simulation uses an array-based FIFO queue.

When a tank becomes low:

```text
enqueue tank request
```

When the controller becomes available:

```text
dequeue oldest request
start refill
```

This ensures first-request-first-serve behavior.

### 5.6 Fault Detection Logic

The simulation checks for several abnormal cases:

| Fault | Detection Method |
|---|---|
| Low purified water | Calculated water volume below threshold |
| Low chemical | Chemical estimate below threshold |
| Leak | Manual fault switch or chemical estimate mismatch |
| Dry water supply | Water flow is zero during refill |
| Chemical no-flow | Chemical flow is zero during refill |
| Blocked valve | Fault switch stops volume progress |
| Dispense timeout | Refill takes longer than allowed |

When a fault occurs:

1. Alarm LED turns on.
2. Buzzer sounds.
3. Valves and pumps are turned off.
4. LCD displays the alarm message.
5. Serial Monitor prints the alarm.

## 6. Serial Monitor Commands

Serial Monitor is optional because auto-demo mode runs by itself. If you want manual tests, open Serial Monitor at:

```text
115200 baud
```

Available commands:

| Command | Function |
|---|---|
| `help` | Shows all test commands |
| `low1` | Request refill for Ward-A |
| `low2` | Request refill for ICU |
| `low3` | Request refill for Theatre |
| `all` | Queue all three tanks in FIFO order |
| `waterlow` | Force low water condition |
| `chemlow` | Force low chemical condition |
| `leak` | Force leak alarm |
| `block` | Arm blocked valve fault |
| `dry` | Arm dry supply/no-water-flow fault |
| `newchem` | Recalibrate chemical estimate to the current load-cell reading |
| `clearfaults` | Clear injected faults |
| `reset` | Clear alarms and queue |
| `status` | Print current system status |
| `report` | Print dispensing report |

For the slide switches in the visual circuit, the default right-side position is the inactive/safe state. Flip a tank switch left to simulate a low-level request. Flip a fault switch left to inject that fault.

## 7. Recommended Test Scenarios

### 7.1 Single Tank Refill

Type:

```text
low1
```

Expected result:

- Ward-A tank is queued.
- Water valve LED turns on.
- Chemical pump LED turns on.
- Mix pump LED turns on.
- Ward-A valve LED turns on.
- LCD shows refill progress.
- System returns to Ready after refill.

### 7.2 FIFO Multi-Tank Refill

Type:

```text
all
```

Expected result:

The tanks are served in this order:

```text
Ward-A -> ICU -> Theatre
```

Only one green tank valve LED should be on at any time.

### 7.3 Low Water Fault

Type:

```text
waterlow
low1
```

Expected result:

The controller rejects the refill and raises a water-low alarm.

### 7.4 Low Chemical Fault

Type:

```text
chemlow
low1
```

Expected result:

The controller raises a chemical-low alarm before dispensing.

### 7.5 Dry Supply Fault

Type:

```text
dry
low1
```

Expected result:

The system starts a refill, detects no water flow, then raises a no-water-flow alarm.

### 7.6 Blocked Valve Fault

Type:

```text
block
low1
```

Expected result:

The system starts a refill but detects that volume is not progressing, then raises a blocked-valve alarm.

### 7.7 Usage Report

After one or more successful refills, type:

```text
report
```

Expected result:

The Serial Monitor prints:

- Tank location
- Number of refills
- Total mixed disinfectant volume
- Chemical used per location
- Total chemical used

## 8. Is the Complete Simulation Included?

Yes, the current project includes a complete Wokwi simulation for the required control behavior:

- Purified water level measurement
- Chemical remaining estimation
- Flow-based dosing
- PPM-based dilution calculation
- PWM pump command representation
- Actual flow feedback representation
- Sequential tank refill queue
- Low-level tank request handling
- Leak, dry supply, blocked valve, timeout, and low-level alarms
- LCD gauge display
- Audible and visual alarm indicators
- Usage reporting through Serial Monitor

However, some physical hardware is represented using Wokwi-friendly components. For example, potentiometers represent flow meters and load-cell readings, and LEDs represent valves and pumps. This is normal for a Wokwi proof-of-concept simulation.

The simulation does not model:

- Real pipe pressure losses
- Real pump curves
- Turbulent mixing behavior
- Actual chemical evaporation
- MQTT/cloud dashboard communication inside Wokwi
- Tens of physical tanks at once

Those parts are covered conceptually in the report and can be implemented in hardware or in the Node/MQTT simulation if needed.

## 9. How to Run in Wokwi Website

1. Open Wokwi and create an ESP32 Arduino project.
2. Paste `sketch.ino` into the Wokwi sketch file.
3. Paste `diagram.json` into the Wokwi diagram file.
4. Add `libraries.txt` with:

```text
LiquidCrystal I2C
```

5. Press Play.
6. Wait about 5 seconds. The simulation will automatically queue and refill Ward-A, ICU, and Theatre.
7. Optional: open Serial Monitor at `115200` and type `help` for manual testing.

Do not use the ESP-IDF template. This project uses Arduino-style `setup()` and `loop()`.

## 10. How to Run in Wokwi for VS Code

Wokwi for VS Code requires compiled firmware.

Build with PlatformIO:

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run
```

Then start the simulator:

1. Open `diagram.json`.
2. Press `Ctrl + Shift + P`.
3. Select `Wokwi: Start Simulator`.
4. Wait about 5 seconds. The FIFO refill demo starts automatically.

The `wokwi.toml` file points to:

```text
.pio/build/esp32doit-devkit-v1/firmware.bin
.pio/build/esp32doit-devkit-v1/firmware.elf
```

If either file is missing, build the firmware again before starting Wokwi.

## 11. Mapping to Project Requirements

| Requirement | Simulation Coverage |
|---|---|
| Low-level sensor on each dispensing tank | Three slide switches |
| Refill specified volume using discharged volume | Flow integration to 500 mL target |
| Only one tank refilled at a time | FIFO queue and one active tank state |
| PWM pump does not guarantee flow | PWM LED is separate from flow potentiometer |
| Actual flow measurement required | Water and chemical flow inputs |
| No internal chemical tank sensor | External load-cell estimate represented by potentiometer |
| Continuous external water level measurement | Ultrasonic level calculation |
| Digital gauge | LCD display |
| Detect leaks/failures/dry tanks/blocked valves | Alarm logic and fault switches |
| Operator warnings for low supply tanks | Warning and alarm checks |
| Periodic reports | `report` command |

## 12. Notes for Demonstration

For a live demonstration, use this sequence:

```text
help
status
low1
all
report
reset
dry
low1
reset
leak
```

This shows normal operation, FIFO scheduling, reporting, and fault handling in a clear order.
