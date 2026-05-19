// Hospital Chemical Dosing IoT - Wokwi ESP32 Simulation
// *** MANUAL MODE: All tank queuing is done via slide switches or serial commands. ***
// *** Auto-demo is DISABLED. Potentiometers and switches drive all behaviour.      ***

#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// External, non-contact purified water level sensor.
const int WATER_TRIG_PIN = 5;
const int WATER_ECHO_PIN = 18;
const int WATER_LEVEL_PIN = 39; // potentiometer represents external ultrasonic/level gauge for demo

// External chemical tank estimate and flow feedback inputs.
const int CHEM_WEIGHT_PIN = 34; // potentiometer represents external load-cell/HX711 output
const int WATER_FLOW_PIN = 35;  // potentiometer represents water flow meter frequency
const int CHEM_FLOW_PIN = 32;   // potentiometer represents chemical flow meter frequency

// One low-level sensor per dispensing tank. Active LOW.
const int TANK_LOW_PINS[] = {13, 12, 14};
const int TANK_COUNT = 3;

// Fault injection switches. Active LOW.
const int LEAK_SWITCH_PIN = 33;
const int BLOCK_SWITCH_PIN = 25;
const int DRY_SWITCH_PIN = 36;

// Actuators and indicators.
const int WATER_VALVE_LED = 23;
const int CHEM_PUMP_PWM_LED = 19;
const int MIX_PUMP_LED = 26;
const int TANK_VALVE_LEDS[] = {4, 16, 17};
const int READY_LED = 2;
const int ALARM_LED = 15;
const int BUZZER_PIN = 27;

// I2C LCD uses standard ESP32 I2C pins.
const int LCD_SDA_PIN = 21;
const int LCD_SCL_PIN = 22;
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Physical assumptions from the report.
const float WATER_TANK_HEIGHT_CM    = 400.0;
const float WATER_TANK_CAPACITY_L   = 2000.0;
const float WATER_LOW_THRESHOLD_L   = 200.0;   // << THRESHOLD
const float CHEM_BOTTLE_FULL_ML     = 10000.0;
const float CHEM_LOW_THRESHOLD_ML   = 800.0;   // << THRESHOLD
const float CONCENTRATE_PPM         = 100000.0;
const float TARGET_PPM              = 1000.0;
const float TARGET_REFILL_ML        = 500.0;
// Derived dosing targets:
const float WATER_TARGET_ML = TARGET_REFILL_ML * (1.0 - (TARGET_PPM / CONCENTRATE_PPM)); // = 495.0 mL
const float CHEM_TARGET_ML  = TARGET_REFILL_ML * (TARGET_PPM / CONCENTRATE_PPM);          // = 5.0 mL

const unsigned long DISPENSE_TIMEOUT_MS = 30000; // << THRESHOLD
const unsigned long STATUS_PRINT_MS     = 2000;
const unsigned long LCD_REFRESH_MS      = 750;

// *** AUTO-DEMO DISABLED: tanks queue only via switches or serial commands ***
const bool AUTO_DEMO_ENABLED = false;

// Flow alarm grace period (ms after dispense start before checking flow)
const unsigned long FLOW_CHECK_GRACE_MS = 3000; // << THRESHOLD
// Flow alarm thresholds
const float WATER_FLOW_MIN_ML_S = 1.0;   // << THRESHOLD: below this = no-water-flow alarm
const float CHEM_FLOW_MIN_ML_S  = 0.05;  // << THRESHOLD: below this = no-chem-flow alarm
// Chem mismatch warning: fires when |load-cell - flow-estimate| > 10 % of full bottle
const float CHEM_MISMATCH_RATIO = 0.10;  // << THRESHOLD

enum RunState { IDLE, DISPENSING, ALARM };

struct TankStats {
  const char *name;
  bool queued;
  bool lastLow;
  unsigned int refillCount;
  float mixedDispensedML;
  float chemicalUsedML;
};

TankStats tanks[TANK_COUNT] = {
  {"Ward-A",  false, false, 0, 0, 0},
  {"ICU",     false, false, 0, 0, 0},
  {"Theatre", false, false, 0, 0, 0}
};

int refillQueue[12];
int queueHead = 0, queueTail = 0, queueSize = 0;

RunState state = IDLE;
int activeTank = -1;
unsigned long dispenseStartedAt = 0;
unsigned long lastUpdateAt = 0;
unsigned long lastStatusAt = 0;
unsigned long lastLcdAt = 0;
unsigned long lastWarningAt = 0;
float waterDosedML = 0;
float chemDosedML  = 0;
float waterLevelL  = 1800.0;
float chemicalLoadCellML      = CHEM_BOTTLE_FULL_ML;
float chemicalFlowEstimateML  = CHEM_BOTTLE_FULL_ML;
float chemicalInitialEstimateML = CHEM_BOTTLE_FULL_ML;
float totalChemicalUsedML = 0;
bool simulatedLeak           = false;
bool simulatedBlockedValve   = false;
bool simulatedDrySupply      = false;
bool forcedWaterLow          = false;
bool forcedChemicalLow       = false;
String alarmMessage = "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
float mapFloat(int raw, float outMin, float outMax) {
  return outMin + (outMax - outMin) * ((float)raw / 4095.0);
}

bool switchActiveDigital(int pin) { return digitalRead(pin) == LOW; }

void setAllTankValvesLow() {
  for (int i = 0; i < TANK_COUNT; i++) digitalWrite(TANK_VALVE_LEDS[i], LOW);
}

// ---------------------------------------------------------------------------
// Alarm / queue helpers
// ---------------------------------------------------------------------------
void setAlarm(const String &message) {
  state = ALARM;
  alarmMessage = message;
  digitalWrite(ALARM_LED, HIGH);
  digitalWrite(WATER_VALVE_LED, LOW);
  analogWrite(CHEM_PUMP_PWM_LED, 0);
  digitalWrite(MIX_PUMP_LED, LOW);
  setAllTankValvesLow();
  tone(BUZZER_PIN, 1800);
  Serial.println();
  Serial.println("[ALARM] " + message);
}

void clearAlarm() {
  state = IDLE;
  alarmMessage = "";
  noTone(BUZZER_PIN);
  digitalWrite(ALARM_LED, LOW);
  Serial.println("[CTRL] Alarm cleared");
}

void enqueueTank(int tankIndex, const char *reason) {
  if (tankIndex < 0 || tankIndex >= TANK_COUNT) return;
  if (tanks[tankIndex].queued || tankIndex == activeTank) return;
  if (queueSize >= 12) { setAlarm("Queue full"); return; }
  refillQueue[queueTail] = tankIndex;
  queueTail = (queueTail + 1) % 12;
  queueSize++;
  tanks[tankIndex].queued = true;
  Serial.print("[QUEUE] Added ");
  Serial.print(tanks[tankIndex].name);
  Serial.print(" because ");
  Serial.print(reason);
  Serial.print(". Queue size=");
  Serial.println(queueSize);
}

int dequeueTank() {
  if (queueSize == 0) return -1;
  int idx = refillQueue[queueHead];
  queueHead = (queueHead + 1) % 12;
  queueSize--;
  tanks[idx].queued = false;
  return idx;
}

// ---------------------------------------------------------------------------
// Sensor reads
// ---------------------------------------------------------------------------
float readWaterLevelLitres() {
  if (forcedWaterLow) return 120.0;
  int raw = analogRead(WATER_LEVEL_PIN);
  if (raw > 20) return mapFloat(raw, 0.0, WATER_TANK_CAPACITY_L);

  // Fall back to HC-SR04
  digitalWrite(WATER_TRIG_PIN, LOW);  delayMicroseconds(2);
  digitalWrite(WATER_TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(WATER_TRIG_PIN, LOW);
  unsigned long duration = pulseIn(WATER_ECHO_PIN, HIGH, 30000);
  if (duration == 0) return waterLevelL;
  float distCm   = (duration * 0.0343) / 2.0;
  float heightCm = constrain(WATER_TANK_HEIGHT_CM - distCm, 0.0, WATER_TANK_HEIGHT_CM);
  return constrain((heightCm / WATER_TANK_HEIGHT_CM) * WATER_TANK_CAPACITY_L, 0.0, WATER_TANK_CAPACITY_L);
}

float readChemicalLoadCellML() {
  if (forcedChemicalLow) return 350.0;
  return mapFloat(analogRead(CHEM_WEIGHT_PIN), 0.0, CHEM_BOTTLE_FULL_ML);
}

float readWaterFlowMLPerSec() {
  if (simulatedDrySupply) return 0.0;
  return mapFloat(analogRead(WATER_FLOW_PIN), 0.0, 180.0);
}

float readChemicalFlowMLPerSec() {
  return mapFloat(analogRead(CHEM_FLOW_PIN), 0.0, 18.0);
}

// ---------------------------------------------------------------------------
// Dispense lifecycle
// ---------------------------------------------------------------------------
void beginDispense(int tankIndex) {
  activeTank = tankIndex;
  state = DISPENSING;
  waterDosedML = 0;
  chemDosedML  = 0;
  dispenseStartedAt = millis();
  lastUpdateAt = millis();

  digitalWrite(READY_LED, LOW);
  digitalWrite(WATER_VALVE_LED, HIGH);
  analogWrite(CHEM_PUMP_PWM_LED, 185);
  digitalWrite(MIX_PUMP_LED, HIGH);
  setAllTankValvesLow();
  digitalWrite(TANK_VALVE_LEDS[tankIndex], HIGH);

  Serial.println();
  Serial.print("[CTRL] Starting refill for ");
  Serial.print(tanks[tankIndex].name);
  Serial.print(" target=");    Serial.print(TARGET_REFILL_ML, 1);
  Serial.print("mL water=");   Serial.print(WATER_TARGET_ML, 1);
  Serial.print("mL chemical="); Serial.print(CHEM_TARGET_ML, 2);
  Serial.println("mL");
}

void finishDispense() {
  digitalWrite(WATER_VALVE_LED, LOW);
  analogWrite(CHEM_PUMP_PWM_LED, 0);
  digitalWrite(MIX_PUMP_LED, LOW);
  setAllTankValvesLow();

  tanks[activeTank].refillCount++;
  tanks[activeTank].mixedDispensedML += waterDosedML + chemDosedML;
  tanks[activeTank].chemicalUsedML   += chemDosedML;
  totalChemicalUsedML += chemDosedML;
  chemicalFlowEstimateML = chemicalInitialEstimateML - totalChemicalUsedML;
  if (chemicalFlowEstimateML < 0) chemicalFlowEstimateML = 0;

  Serial.print("[DONE] ");
  Serial.print(tanks[activeTank].name);
  Serial.print(" received ");
  Serial.print(waterDosedML + chemDosedML, 1);
  Serial.print("mL mixed disinfectant, chemical=");
  Serial.print(chemDosedML, 2);
  Serial.println("mL");

  activeTank = -1;
  state = IDLE;
  digitalWrite(READY_LED, HIGH);
}

void updateDispense() {
  unsigned long now = millis();
  float dt = (now - lastUpdateAt) / 1000.0;
  lastUpdateAt = now;

  if (simulatedBlockedValve) dt = 0;

  float waterFlow = readWaterFlowMLPerSec();
  float chemFlow  = readChemicalFlowMLPerSec();

  if (waterDosedML < WATER_TARGET_ML) waterDosedML += waterFlow * dt;
  else digitalWrite(WATER_VALVE_LED, LOW);

  if (chemDosedML < CHEM_TARGET_ML) chemDosedML += chemFlow * dt;
  else analogWrite(CHEM_PUMP_PWM_LED, 0);

  waterDosedML = min(waterDosedML, WATER_TARGET_ML);
  chemDosedML  = min(chemDosedML,  CHEM_TARGET_ML);

  bool inGrace = (now - dispenseStartedAt) <= FLOW_CHECK_GRACE_MS;

  if (!inGrace && waterFlow < WATER_FLOW_MIN_ML_S && waterDosedML < WATER_TARGET_ML) {
    setAlarm("No water flow"); return;
  }
  if (!inGrace && chemFlow < CHEM_FLOW_MIN_ML_S && chemDosedML < CHEM_TARGET_ML) {
    setAlarm("No chem flow"); return;
  }
  if (simulatedBlockedValve && !inGrace) {
    setAlarm("Blocked valve"); return;
  }
  if (now - dispenseStartedAt > DISPENSE_TIMEOUT_MS) {
    setAlarm("Disp timeout"); return;
  }
  if (waterDosedML >= WATER_TARGET_ML && chemDosedML >= CHEM_TARGET_ML) {
    finishDispense();
  }
}

// ---------------------------------------------------------------------------
// Tank low-level switch scan (manual trigger via slide switches)
// ---------------------------------------------------------------------------
void scanTankLowSensors() {
  for (int i = 0; i < TANK_COUNT; i++) {
    bool lowNow = switchActiveDigital(TANK_LOW_PINS[i]);
    if (lowNow && !tanks[i].lastLow) enqueueTank(i, "low-level switch");
    tanks[i].lastLow = lowNow;
  }
}

// ---------------------------------------------------------------------------
// Serial output
// ---------------------------------------------------------------------------
void printStatus() {
  Serial.print("[STATUS] State=");
  Serial.print(state == IDLE ? "IDLE" : state == DISPENSING ? "DISPENSING" : "ALARM");
  Serial.print(" Water=");  Serial.print(waterLevelL, 0);
  Serial.print("L ChemLoad="); Serial.print(chemicalLoadCellML, 0);
  Serial.print("mL ChemFlowEst="); Serial.print(chemicalFlowEstimateML, 0);
  Serial.print("mL Queue="); Serial.print(queueSize);
  if (activeTank >= 0) {
    Serial.print(" Active="); Serial.print(tanks[activeTank].name);
    Serial.print(" W=");  Serial.print(waterDosedML, 1);
    Serial.print("/");    Serial.print(WATER_TARGET_ML, 1);
    Serial.print(" C=");  Serial.print(chemDosedML, 2);
    Serial.print("/");    Serial.print(CHEM_TARGET_ML, 2);
  }
  Serial.println();
}

void printReport() {
  Serial.println();
  Serial.println("========== PERIODIC DISPENSING REPORT ==========");
  Serial.println("Location, Refills, Mixed mL, Chemical mL");
  for (int i = 0; i < TANK_COUNT; i++) {
    Serial.print(tanks[i].name); Serial.print(", ");
    Serial.print(tanks[i].refillCount); Serial.print(", ");
    Serial.print(tanks[i].mixedDispensedML, 1); Serial.print(", ");
    Serial.println(tanks[i].chemicalUsedML, 2);
  }
  Serial.print("Total chemical used: ");
  Serial.print(totalChemicalUsedML, 2);
  Serial.println(" mL");
  Serial.println("===============================================");
  Serial.println();
}

void showHelp() {
  Serial.println();
  Serial.println("=== MANUAL MODE — commands ===");
  Serial.println("  low1 / low2 / low3  - enqueue Ward-A / ICU / Theatre via serial");
  Serial.println("  all                 - enqueue all tanks FIFO");
  Serial.println("  waterlow            - force purified-water low");
  Serial.println("  chemlow             - force chemical low");
  Serial.println("  leak                - inject leak alarm");
  Serial.println("  block               - arm blocked valve fault");
  Serial.println("  dry                 - arm dry supply fault");
  Serial.println("  newchem             - recalibrate chemical estimate to load-cell reading");
  Serial.println("  clearfaults         - clear injected faults");
  Serial.println("  reset               - clear alarm, queue and all faults");
  Serial.println("  status              - print current telemetry");
  Serial.println("  report              - print usage report");
  Serial.println();
  Serial.println("To queue a tank manually: flip the relevant slide switch LEFT.");
  Serial.println("All other inputs are live potentiometers.");
  Serial.println();
}

void resetQueue() {
  queueHead = queueTail = queueSize = 0;
  for (int i = 0; i < TANK_COUNT; i++) tanks[i].queued = false;
}

// ---------------------------------------------------------------------------
// Serial command handler
// ---------------------------------------------------------------------------
void handleSerial() {
  if (!Serial.available()) return;
  String cmd = Serial.readStringUntil('\n');
  cmd.trim(); cmd.toLowerCase();
  if (cmd.length() == 0) return;

  if      (cmd == "help")   showHelp();
  else if (cmd == "low1")   enqueueTank(0, "serial test");
  else if (cmd == "low2")   enqueueTank(1, "serial test");
  else if (cmd == "low3")   enqueueTank(2, "serial test");
  else if (cmd == "all") {
    enqueueTank(0, "serial FIFO test");
    enqueueTank(1, "serial FIFO test");
    enqueueTank(2, "serial FIFO test");
  }
  else if (cmd == "waterlow") { forcedWaterLow = true; Serial.println("[TEST] Water low forced"); }
  else if (cmd == "chemlow")  { forcedChemicalLow = true; Serial.println("[TEST] Chemical low forced"); }
  else if (cmd == "leak")  { simulatedLeak = true; setAlarm("Leak detected"); }
  else if (cmd == "block") { simulatedBlockedValve = true; Serial.println("[TEST] Blocked valve armed"); }
  else if (cmd == "dry")   { simulatedDrySupply = true; Serial.println("[TEST] Dry supply armed"); }
  else if (cmd == "newchem") {
    chemicalInitialEstimateML = chemicalLoadCellML;
    chemicalFlowEstimateML    = chemicalInitialEstimateML - totalChemicalUsedML;
    if (chemicalFlowEstimateML < 0) chemicalFlowEstimateML = 0;
    Serial.print("[TEST] Chemical estimate recalibrated to ");
    Serial.print(chemicalInitialEstimateML, 0); Serial.println(" mL");
  }
  else if (cmd == "clearfaults") {
    simulatedLeak = simulatedBlockedValve = simulatedDrySupply = false;
    forcedWaterLow = forcedChemicalLow = false;
    Serial.println("[TEST] Fault injections cleared");
  }
  else if (cmd == "reset") {
    resetQueue();
    simulatedLeak = simulatedBlockedValve = simulatedDrySupply = false;
    forcedWaterLow = forcedChemicalLow = false;
    clearAlarm();
    activeTank = -1;
    digitalWrite(WATER_VALVE_LED, LOW);
    analogWrite(CHEM_PUMP_PWM_LED, 0);
    digitalWrite(MIX_PUMP_LED, LOW);
    setAllTankValvesLow();
  }
  else if (cmd == "status") printStatus();
  else if (cmd == "report") printReport();
  else Serial.println("[WARN] Unknown command. Type help.");
}

// ---------------------------------------------------------------------------
// LCD update
// ---------------------------------------------------------------------------
void updateLcd() {
  unsigned long now = millis();
  if (now - lastLcdAt < LCD_REFRESH_MS) return;
  lastLcdAt = now;
  lcd.clear();
  if (state == ALARM) {
    lcd.setCursor(0, 0); lcd.print("ALARM");
    lcd.setCursor(0, 1); lcd.print(alarmMessage.substring(0, 16));
    return;
  }
  lcd.setCursor(0, 0);
  lcd.print("W:"); lcd.print((int)waterLevelL);
  lcd.print("L C:"); lcd.print((int)(chemicalLoadCellML / 1000.0)); lcd.print("L");
  lcd.setCursor(0, 1);
  if (state == DISPENSING && activeTank >= 0) {
    lcd.print(tanks[activeTank].name); lcd.print(" ");
    lcd.print((int)(waterDosedML + chemDosedML)); lcd.print("/"); lcd.print((int)TARGET_REFILL_ML);
  } else {
    lcd.print("Ready Q:"); lcd.print(queueSize);
    lcd.print(" PPM:"); lcd.print((int)TARGET_PPM);
  }
}

// ---------------------------------------------------------------------------
// Pre-checks before starting next dispense
// ---------------------------------------------------------------------------
void runPreChecksAndStartNext() {
  if (state != IDLE || queueSize == 0) return;

  if (waterLevelL < WATER_LOW_THRESHOLD_L) { setAlarm("Water low"); return; }
  if (chemicalLoadCellML < CHEM_LOW_THRESHOLD_ML || chemicalFlowEstimateML < CHEM_TARGET_ML) {
    setAlarm("Chemical low"); return;
  }
  if (simulatedLeak || switchActiveDigital(LEAK_SWITCH_PIN)) { setAlarm("Leak detected"); return; }

  int nextTank = dequeueTank();
  beginDispense(nextTank);
}

// ---------------------------------------------------------------------------
// Setup / Loop
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(WATER_TRIG_PIN, OUTPUT);
  pinMode(WATER_ECHO_PIN, INPUT);
  pinMode(WATER_LEVEL_PIN, INPUT);
  pinMode(CHEM_WEIGHT_PIN, INPUT);
  pinMode(WATER_FLOW_PIN, INPUT);
  pinMode(CHEM_FLOW_PIN, INPUT);
  pinMode(LEAK_SWITCH_PIN, INPUT);
  pinMode(BLOCK_SWITCH_PIN, INPUT);
  pinMode(DRY_SWITCH_PIN, INPUT);

  for (int i = 0; i < TANK_COUNT; i++) {
    pinMode(TANK_LOW_PINS[i], INPUT);
    pinMode(TANK_VALVE_LEDS[i], OUTPUT);
  }
  pinMode(WATER_VALVE_LED, OUTPUT);
  pinMode(CHEM_PUMP_PWM_LED, OUTPUT);
  pinMode(MIX_PUMP_LED, OUTPUT);
  pinMode(READY_LED, OUTPUT);
  pinMode(ALARM_LED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);
  lcd.init(); lcd.begin(16, 2); lcd.display(); lcd.backlight();
  lcd.setCursor(0, 0); lcd.print("Hospital Dosing");
  lcd.setCursor(0, 1); lcd.print("Manual mode");

  digitalWrite(READY_LED, HIGH);
  digitalWrite(ALARM_LED, LOW);
  digitalWrite(WATER_VALVE_LED, LOW);
  digitalWrite(MIX_PUMP_LED, LOW);
  analogWrite(CHEM_PUMP_PWM_LED, 0);
  setAllTankValvesLow();
  noTone(BUZZER_PIN);

  chemicalLoadCellML      = readChemicalLoadCellML();
  chemicalInitialEstimateML = CHEM_BOTTLE_FULL_ML;
  chemicalFlowEstimateML  = chemicalInitialEstimateML;

  Serial.println();
  Serial.println("Hospital Chemical Dosing IoT - MANUAL MODE");
  Serial.println("Flip tank switches LEFT to queue a refill.");
  Serial.println("Adjust potentiometers to change sensor readings.");
  Serial.println("Type help for serial commands.");
  showHelp();
}

void loop() {
  handleSerial();

  waterLevelL        = readWaterLevelLitres();
  chemicalLoadCellML = readChemicalLoadCellML();

  // Live fault-switch reads (switches latch faults; reset clears them)
  simulatedLeak         = simulatedLeak         || switchActiveDigital(LEAK_SWITCH_PIN);
  simulatedBlockedValve = simulatedBlockedValve || switchActiveDigital(BLOCK_SWITCH_PIN);
  simulatedDrySupply    = simulatedDrySupply    || (digitalRead(DRY_SWITCH_PIN) == HIGH);

  // Periodic warning printouts
  if (state != ALARM && millis() - lastWarningAt > 3000) {
    lastWarningAt = millis();
    if (chemicalLoadCellML < CHEM_LOW_THRESHOLD_ML)
      Serial.println("[WARN] Chemical container below threshold");
    if (waterLevelL < WATER_LOW_THRESHOLD_L)
      Serial.println("[WARN] Purified water below threshold");
    float diff = abs(chemicalLoadCellML - chemicalFlowEstimateML);
    if (!forcedChemicalLow && diff > CHEM_BOTTLE_FULL_ML * CHEM_MISMATCH_RATIO)
      Serial.println("[WARN] Chemical load/flow estimate mismatch");
  }

  if (state == IDLE) {
    // *** No auto-demo here — all queuing is manual ***
    scanTankLowSensors();       // Slide switches queue tanks
    runPreChecksAndStartNext(); // Start next if queue non-empty and all checks pass
  } else if (state == DISPENSING) {
    updateDispense();
  }

  if (millis() - lastStatusAt > STATUS_PRINT_MS) {
    lastStatusAt = millis();
    printStatus();
  }

  updateLcd();
  delay(20);
}
