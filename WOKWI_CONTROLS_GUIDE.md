# Wokwi Controls Guide

This file explains what each visible Wokwi control represents, what happens when you adjust it, and how to interpret the LEDs and switches during the hospital chemical dosing simulation.

## 1. Potentiometers

The simulation uses potentiometers to represent analog sensor values. In Wokwi, turning a potentiometer clockwise usually increases its analog reading. Turning it anticlockwise decreases its analog reading.

### 1.1 `waterLevel` Potentiometer

Represents:

```text
External purified-water tank level measurement
```

Real-world equivalent:

```text
Externally mounted ultrasonic level sensor / external water-level gauge
```

What it affects:

```text
Water=...L
```

in the Serial Monitor.

Clockwise:

```text
Increases simulated purified water level
```

Anticlockwise:

```text
Decreases simulated purified water level
```

Expected behavior:

- High value: system allows refilling.
- Low value: system prints low-water warnings.
- Very low value: refill is rejected with water-low alarm.

Example Serial output:

```text
[STATUS] State=IDLE Water=1760L ...
```

If the water level drops below the threshold, the system warns:

```text
[WARN] Purified water below threshold
```

### 1.2 `chemWeight` Potentiometer

Represents:

```text
External chemical container weight/load-cell reading
```

Real-world equivalent:

```text
Load cell platform under the 10 L concentrated chemical container
```

What it affects:

```text
ChemLoad=...mL
```

in the Serial Monitor.

Clockwise:

```text
Increases simulated chemical remaining in the container
```

Anticlockwise:

```text
Decreases simulated chemical remaining in the container
```

Expected behavior:

- High value: enough chemical is available.
- Low value: system warns or alarms for low chemical.
- If the value differs a lot from the computational estimate, the system prints a mismatch warning.

Example:

```text
[STATUS] ChemLoad=9287mL ChemFlowEst=10000mL
```

Important:

`ChemLoad` and `ChemFlowEst` are intentionally different types of estimates.

- `ChemLoad` is the external load-cell estimate.
- `ChemFlowEst` is the computational estimate.

To recalibrate the computational estimate to the current chemical load, type:

```text
newchem
```

### 1.3 `waterFlow` Potentiometer

Represents:

```text
Measured water flow meter feedback
```

Real-world equivalent:

```text
Water flow meter installed in the purified water discharge line
```

What it affects:

```text
W=.../495.0
```

during dispensing.

Clockwise:

```text
Increases measured water flow rate
```

Anticlockwise:

```text
Decreases measured water flow rate
```

Expected behavior:

- High value: water volume increases quickly during refill.
- Low value: water volume increases slowly.
- Zero/near-zero value: system detects no water flow and raises an alarm.

Example alarm:

```text
[ALARM] No water flow
```

If you keep getting `No water flow`, turn the `waterFlow` potentiometer clockwise, type:

```text
reset
low1
```

### 1.4 `chemFlow` Potentiometer

Represents:

```text
Measured chemical flow meter feedback
```

Real-world equivalent:

```text
Chemical flow meter installed after the PWM-controlled chemical pump
```

What it affects:

```text
C=.../5.00
```

during dispensing.

Clockwise:

```text
Increases measured chemical flow rate
```

Anticlockwise:

```text
Decreases measured chemical flow rate
```

Expected behavior:

- High value: chemical dose reaches 5 mL quickly.
- Low value: chemical dose reaches 5 mL slowly.
- Zero/near-zero value: system detects no chemical flow and raises an alarm.

Example alarm:

```text
[ALARM] No chem flow
```

## 2. LEDs

The LEDs represent actuators and status indicators. In the real system, these would correspond to valves, pumps, and warning lamps.

### 2.1 `Ready` LED

Color:

```text
Green
```

Represents:

```text
System ready / idle
```

When ON:

```text
The system is idle and ready to accept refill requests.
```

When OFF:

```text
The system is dispensing or in another active state.
```

### 2.2 `Alarm` LED

Color:

```text
Red
```

Represents:

```text
Fault warning indicator
```

When ON:

```text
The system detected an abnormal condition.
```

Possible causes:

- No water flow
- No chemical flow
- Low water
- Low chemical
- Leak
- Blocked valve
- Dispense timeout

Clear the alarm with:

```text
reset
```

### 2.3 `Water Valve` LED

Color:

```text
Blue
```

Represents:

```text
Purified water solenoid valve
```

When ON:

```text
The water valve is open and water should be flowing.
```

When OFF:

```text
The water valve is closed.
```

If this LED is ON but water volume stays at:

```text
W=0.0/495.0
```

then the `waterFlow` potentiometer is probably too low.

### 2.4 `Chem Pump PWM` LED

Color:

```text
Yellow
```

Represents:

```text
PWM command sent to the chemical pump
```

When ON:

```text
The controller is commanding the chemical pump to run.
```

Important:

This LED only represents the PWM command. It does not prove that chemical is actually flowing. Actual chemical flow is represented by the `chemFlow` potentiometer and the measured chemical dose:

```text
C=.../5.00
```

This demonstrates the requirement that PWM does not guarantee accurate flow rate.

### 2.5 `Mix/transfer Pump` LED

Color:

```text
Cyan
```

Represents:

```text
Mixing chamber / transfer pump
```

When ON:

```text
The mixed disinfectant is being transferred toward the selected dispensing tank.
```

### 2.6 `Ward-A Valve` LED

Color:

```text
Green
```

Represents:

```text
Dispensing valve for Ward-A tank
```

When ON:

```text
Ward-A is the active tank being refilled.
```

### 2.7 `ICU Valve` LED

Color:

```text
Green
```

Represents:

```text
Dispensing valve for ICU tank
```

When ON:

```text
ICU is the active tank being refilled.
```

### 2.8 `Theatre Valve` LED

Color:

```text
Green
```

Represents:

```text
Dispensing valve for Theatre tank
```

When ON:

```text
Theatre is the active tank being refilled.
```

Important FIFO rule:

Only one of these three tank valve LEDs should be ON at a time.

## 3. Buzzer

### `alarmBuzzer`

Represents:

```text
Audible alarm
```

When active:

```text
The system has detected a fault and is warning the operator.
```

It works together with the red `Alarm` LED.

Clear it with:

```text
reset
```

## 4. Slide Switches

The slide switches are digital inputs. In this simulation:

```text
Right position = safe/inactive
Left position = active/test condition
```

This matches the updated `diagram.json`, where the default switch value is set to the safe side.

### 4.1 `tank1Low` Switch

Represents:

```text
Ward-A dispensing tank low-level sensor
```

Flip left:

```text
Ward-A requests refill
```

Expected Serial output:

```text
[QUEUE] Added Ward-A because low-level switch
```

Expected visual behavior:

- Ward-A valve LED turns ON during refill.
- Water valve LED turns ON.
- Chemical pump LED turns ON.
- Mix/transfer pump LED turns ON.

### 4.2 `tank2Low` Switch

Represents:

```text
ICU dispensing tank low-level sensor
```

Flip left:

```text
ICU requests refill
```

Expected Serial output:

```text
[QUEUE] Added ICU because low-level switch
```

### 4.3 `tank3Low` Switch

Represents:

```text
Theatre dispensing tank low-level sensor
```

Flip left:

```text
Theatre requests refill
```

Expected Serial output:

```text
[QUEUE] Added Theatre because low-level switch
```

### 4.4 `leakFault` Switch

Represents:

```text
Chemical leak or pipeline leak detection
```

Flip left:

```text
Leak fault is injected
```

Expected result:

```text
[ALARM] Leak detected
```

Alarm LED and buzzer should turn ON.

### 4.5 `blockFault` Switch

Represents:

```text
Blocked valve / blocked dispensing path
```

Flip left before or during a refill:

```text
Blocked valve condition is injected
```

Expected result:

```text
[ALARM] Blocked valve
```

### 4.6 `dryFault` Switch

Represents:

```text
Dry purified-water supply / no water at outlet
```

Flip left before or during a refill:

```text
Dry supply condition is injected
```

Expected result:

```text
[ALARM] No water flow
```

## 5. Serial Monitor Values

Example:

```text
[STATUS] State=DISPENSING Water=1760L ChemLoad=9287mL ChemFlowEst=10000mL Queue=2 Active=Ward-A W=0.0/495.0 C=5.00/5.00
```

Meaning:

| Field | Meaning |
|---|---|
| `State=IDLE` | System is ready |
| `State=DISPENSING` | A tank is being refilled |
| `State=ALARM` | Fault detected |
| `Water=1760L` | Estimated purified water remaining |
| `ChemLoad=9287mL` | External load-cell estimate of chemical remaining |
| `ChemFlowEst=10000mL` | Computational chemical estimate |
| `Queue=2` | Two tanks waiting for refill |
| `Active=Ward-A` | Ward-A is currently being refilled |
| `W=0.0/495.0` | Water dispensed / target water volume |
| `C=5.00/5.00` | Chemical dispensed / target chemical volume |

## 6. Common Problems and Fixes

### Problem: `No water flow`

Cause:

```text
The `waterFlow` potentiometer is too low or wired/read as zero.
```

Fix:

1. Turn `waterFlow` clockwise.
2. Type:

```text
reset
low1
```

### Problem: `No chem flow`

Cause:

```text
The `chemFlow` potentiometer is too low.
```

Fix:

1. Turn `chemFlow` clockwise.
2. Type:

```text
reset
low1
```

### Problem: `ChemLoad=0mL`

Cause:

```text
The `chemWeight` potentiometer is turned fully anticlockwise.
```

Fix:

Turn `chemWeight` clockwise.

### Problem: `Water` is too low

Cause:

```text
The `waterLevel` potentiometer is too low.
```

Fix:

Turn `waterLevel` clockwise.

### Problem: The system is stuck in `ALARM`

Fix:

Type:

```text
reset
```

Then make sure:

- `waterFlow` is not at minimum.
- `chemFlow` is not at minimum.
- `waterLevel` is not at minimum.
- `chemWeight` is not at minimum.
- All fault switches are in the safe/right position.

## 7. Recommended Demonstration Sequence

Set these first:

- `waterLevel`: clockwise/high
- `chemWeight`: clockwise/high
- `waterFlow`: clockwise/high
- `chemFlow`: middle or high
- All switches: right/safe

Then type:

```text
reset
low1
report
reset
all
report
```

For fault demonstration:

```text
reset
dry
low1
reset
block
low1
reset
leak
```

## 8. Quick Component Summary

| Visible Component | What it Represents |
|---|---|
| `waterLevel` potentiometer | External purified-water level sensor |
| `chemWeight` potentiometer | External chemical tank load-cell |
| `waterFlow` potentiometer | Water flow meter |
| `chemFlow` potentiometer | Chemical flow meter |
| Blue LED | Water solenoid valve |
| Yellow LED | Chemical pump PWM command |
| Cyan LED | Mixing/transfer pump |
| Three green tank LEDs | Individual dispensing tank valves |
| Red LED | Alarm warning indicator |
| Buzzer | Audible alarm |
| Tank switches | Low-level sensors |
| Fault switches | Leak, blocked valve, dry supply tests |
