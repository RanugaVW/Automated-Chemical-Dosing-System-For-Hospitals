const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  TableOfContents
} = require('docx');
const fs = require('fs');
const path = require('path');

// ─── Color palette ────────────────────────────────────────────────────────────
const C = { BLUE: "1F4E79", LBLUE: "D6E4F0", MBLUE: "2E75B6", GREY: "F2F2F2", DGREY: "595959" };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const border = (color = "CCCCCC") => ({ style: BorderStyle.SINGLE, size: 1, color });
const borders = (color) => ({ top: border(color), bottom: border(color), left: border(color), right: border(color) });

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160 },
    children: [new TextRun({ text, bold: true, size: 32, color: C.MBLUE, font: "Arial" })]
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: C.BLUE, font: "Arial" })]
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, color: C.DGREY, font: "Arial" })]
  });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 100 },
    alignment: opts.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
    children: [new TextRun({ text, size: 22, font: "Arial", ...opts })]
  });
}
function pj(text, opts = {}) { return p(text, { justify: true, ...opts }); }
function blank() { return new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun("")] }); }
function pageBreak() {
  return new Paragraph({ pageBreakBefore: true });
}
function bullet(text, level = 0, numbered = false) {
  return new Paragraph({
    numbering: { reference: numbered ? "numbers" : "bullets", level },
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, size: 22, font: "Arial" })]
  });
}
function bulletBold(label, rest) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 60, after: 60 },
    children: [
      new TextRun({ text: label, size: 22, font: "Arial", bold: true }),
      new TextRun({ text: rest, size: 22, font: "Arial" })
    ]
  });
}
function note(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    shading: { fill: "FFF8DC", type: ShadingType.CLEAR },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: "FFA500" } },
    indent: { left: 360 },
    children: [new TextRun({ text: "Note: " + text, size: 20, font: "Arial", italics: true })]
  });
}

// ─── Table builder ────────────────────────────────────────────────────────────
function makeTable(headers, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      borders: borders("2E75B6"),
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: C.BLUE, type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 160, right: 160 },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 20, font: "Arial" })] })]
    }))
  });
  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => new TableCell({
      borders: borders("CCCCCC"),
      width: { size: colWidths[ci], type: WidthType.DXA },
      shading: { fill: ri % 2 === 0 ? "FFFFFF" : C.GREY, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 160, right: 160 },
      children: [new Paragraph({ children: [new TextRun({ text: cell, size: 20, font: "Arial" })] })]
    }))
  }));
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows]
  });
}

// ─── Mermaid code block (formatted as mono) ───────────────────────────────────
function mermaidBlock(lines) {
  return lines.map(line => new Paragraph({
    spacing: { before: 0, after: 0 },
    shading: { fill: "F4F4F4", type: ShadingType.CLEAR },
    indent: { left: 360, right: 360 },
    children: [new TextRun({ text: line, size: 18, font: "Courier New", color: "1a1a1a" })]
  }));
}

function sectionLabel(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.MBLUE, space: 2 } },
    children: [new TextRun({ text, bold: true, size: 22, font: "Arial", color: C.MBLUE })]
  });
}

// ─── BUILD DOCUMENT ───────────────────────────────────────────────────────────
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: C.MBLUE },
        paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: C.BLUE },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: C.DGREY },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [
          { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 360 } } } }
        ] },
      { reference: "numbers", levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.LOWER_LETTER, text: "%2.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 360 } } } }
        ] }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1260, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.MBLUE, space: 2 } },
          spacing: { after: 100 },
          children: [new TextRun({ text: "Automated Chemical Dosing System for Hospitals – IoT Design Report", size: 18, font: "Arial", color: C.DGREY })]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.MBLUE, space: 2 } },
          spacing: { before: 100 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Page ", size: 18, font: "Arial", color: C.DGREY }),
            PageNumber.CURRENT
          ]
        })]
      })
    },
    children: [

      // ══════════════════════════════════════
      // TITLE PAGE
      // ══════════════════════════════════════
      blank(), blank(), blank(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600, after: 200 },
        children: [new TextRun({ text: "AUTOMATED CHEMICAL DOSING SYSTEM", size: 52, bold: true, font: "Arial", color: C.BLUE })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 200 },
        children: [new TextRun({ text: "FOR HOSPITALS", size: 52, bold: true, font: "Arial", color: C.BLUE })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.MBLUE, space: 4 } },
        spacing: { before: 0, after: 400 },
        children: [new TextRun({ text: "IoT Solution Design Report", size: 36, font: "Arial", color: C.MBLUE, italics: true })]
      }),
      blank(), blank(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: "Comprehensive Design, Construction and Cost Analysis", size: 26, font: "Arial", bold: true })]
      }),
      blank(), blank(), blank(), blank(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 100 },
        children: [new TextRun({ text: "Date: May 2026", size: 22, font: "Arial", color: C.DGREY })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 100 },
        children: [new TextRun({ text: "Document Version: 2.0 (Enhanced)", size: 22, font: "Arial", color: C.DGREY })]
      }),
      pageBreak(),

      // ══════════════════════════════════════
      // EXECUTIVE SUMMARY
      // ══════════════════════════════════════
      h1("Executive Summary"),
      pj("This report presents a comprehensive IoT solution for an automated chemical dosing system in hospital environments. Hospitals require concentrated disinfecting chemicals to be diluted to precise concentrations (measured in parts per million, or PPM) before being transferred to dispensing tanks distributed throughout the facility."),
      blank(),
      pj("The proposed system automates the entire chemical dispensing workflow using a combination of sensors, microcontrollers, actuators, wireless communication networks, and data analytics. The design ensures accurate chemical concentration, timely tank refilling, real-time fault detection, operator alerts, and historical data logging for periodic compliance reporting."),
      blank(),
      pj("Key innovations in this design include: non-invasive ultrasonic water level sensing, dual-method chemical volume estimation using load cells and flow integration, PWM-controlled peristaltic pump dosing with real-time flow feedback, FIFO queue-based tank refilling, WiFi-MQTT primary communication with LoRaWAN fallback for remote areas, comprehensive multi-layer fault detection, and a distributed architecture supporting tens of tanks hospital-wide."),
      blank(),
      pj("All design choices respect the physical and operational constraints specified in the requirements, including the prohibition of internal sensors in the water tank and concentrated chemical containers."),
      pageBreak(),

      // ══════════════════════════════════════
      // CHAPTER 1: LEVEL MEASUREMENT
      // ══════════════════════════════════════
      h1("Chapter 1: Level Measurement Methods"),
      pj("This chapter identifies the most appropriate methods to measure the water level in the purified water supply tank and to estimate the remaining chemical level in the concentrated chemical containers, strictly adhering to all specified constraints."),

      h2("1.1 Purified Water Supply Tank — Non-Invasive Measurement Requirement"),
      pj("The purified water tank has a capacity of approximately 2000 litres, a diameter of 50 cm, and is mounted at an elevated position. The hospital specification explicitly prohibits installing any sensors or devices inside the tank because periodic cleaning operations could damage internal hardware. Therefore, an external, non-invasive measurement method is essential."),

      h3("1.1.1 Recommended Method: Externally Mounted Ultrasonic Distance Sensor"),
      pj("An ultrasonic range sensor (such as the JSN-SR04T weatherproof module) is mounted on the exterior of the tank's lid or top, facing downward into the interior. The sensor operates by emitting short ultrasonic pulses (40 kHz frequency) and measuring the time taken for the echo to return from the water surface. Since the sensor is externally mounted and not submerged, it satisfies the 'no internal sensor' constraint completely. During tank cleaning operations, the lid and sensor can be removed intact without any risk of damage."),
      blank(),
      pj("The water level height (h) is calculated using the formula:"),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 80 },
        shading: { fill: C.GREY, type: ShadingType.CLEAR },
        children: [new TextRun({ text: "h = H_tank - d_measured", size: 22, font: "Courier New", bold: true })]
      }),
      pj("Where H_tank is the total internal height of the tank and d_measured is the distance from the sensor to the water surface. The water volume in litres is then calculated as: V = π r² h / 1000, where r is the tank radius (approximately 25 cm)."),
      blank(),
      pj("The central controller continuously reads this value and displays it on a digital OLED gauge for real-time operator visibility. A low-level threshold alert is triggered when the calculated volume falls below 200 litres, ensuring adequate water supply for the mixing and dispensing process."),

      h3("1.1.2 Alternative Method: Hydrostatic Pressure Transducer at Base Outlet"),
      pj("A pressure transducer can be installed at the base outlet pipe of the tank (external to the tank body itself). Hydrostatic pressure at the base is directly proportional to the height of water above: P = ρgh, where ρ is the fluid density and g is gravitational acceleration. This method is also non-invasive and provides continuous analog signals. However, it requires careful calibration for the specific fluid type and can be affected by varying pressure in the discharge pipe during active flow. The ultrasonic method is preferred for its simplicity and immunity to flow-related pressure variations."),

      h3("1.1.3 External Weight-Based Method Using Load Cells"),
      pj("Load cells mounted under the tank's support structure can measure the total weight of the system and calculate water volume from the weight difference. This method is fully non-invasive and highly accurate. For a 2000-litre tank (approximately 2000 kg of water), however, the load cells, amplifier modules, and structural mounts become expensive and introduce complexity. This method is more cost-effective for smaller containers and is therefore preferred for the chemical supply tank estimation."),

      h2("1.2 Concentrated Chemical Supply Tank — External Level Estimation"),
      pj("Concentrated chemicals arrive in 10-litre bottles. The requirement explicitly prohibits installing any sensor inside these containers. Two complementary methods are employed to track chemical consumption and estimate remaining volume."),

      h3("1.2.1 Recommended Primary Method: Load Cell Weight Measurement"),
      pj("The 10-litre chemical container is placed on a digital load cell platform (a 20 kg capacity load cell with an HX711 analog-to-digital converter module). The system records the tare weight (empty container weight) during container installation. As the chemical pump draws fluid, the weight decreases. The remaining chemical volume is calculated using:"),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 80 },
        shading: { fill: C.GREY, type: ShadingType.CLEAR },
        children: [new TextRun({ text: "V_remaining (litres) = (W_current - W_tare) / (1000 × ρ_chemical)", size: 22, font: "Courier New", bold: true })]
      }),
      pj("Where ρ_chemical is the known density of the concentrated chemical solution (typically 1.0–1.2 g/mL depending on the chemical type). This method provides real-time, accurate chemical inventory tracking without any internal sensors. It also instantly detects sudden weight loss, which could indicate a container leak or rupture — a critical safety feature."),

      h3("1.2.2 Secondary Cross-Check Method: Computational Flow Integration"),
      pj("The chemical pump is equipped with a flow meter (described in Chapter 2). The controller records the cumulative volume pumped since the last container installation:"),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 80 },
        shading: { fill: C.GREY, type: ShadingType.CLEAR },
        children: [new TextRun({ text: "V_remaining = V_initial - Σ(flow_rate × time_interval)", size: 22, font: "Courier New", bold: true })]
      }),
      pj("The operator resets this counter when a new container is installed. This computational method adds no additional hardware cost beyond the already-required flow meter. However, measurement errors accumulate over time. It serves as a valuable cross-check: any discrepancy greater than 10% between the load cell reading and the flow-integrated estimate triggers a 'leak detection' alarm, prompting immediate investigation."),
      blank(),
      note("Dual-method approach: Load cell provides instantaneous weight-based volume; flow integration provides a secondary estimate. Agreement between the two indicates system health. Disagreement signals a potential leak or measurement fault."),

      pageBreak(),

      // ══════════════════════════════════════
      // CHAPTER 2: COMPONENT SELECTION
      // ══════════════════════════════════════
      h1("Chapter 2: Component Selection and Cost Analysis"),
      pj("This chapter identifies the specific component types required for the system and provides a detailed evaluation of at least three commercially available products for each major component category. All pricing information reflects approximate retail or distributor costs as of May 2026 and may vary by region and supplier."),

      h2("2.1 Solenoid Control Valves"),
      pj("Solenoid valves control the water flow from the elevated purified water tank (via gravity) and regulate the inflow of mixed chemical solution into each dispensing tank. All valves selected are normally-closed (NC) type, meaning they remain closed without electrical power — a critical safety feature that prevents uncontrolled chemical discharge in case of power failure."),
      blank(),
      makeTable(
        ["Parameter", "Burkert Type 6013", "ASCO Series 8210", "SMC VX21 Series"],
        [
          ["Operating Voltage", "12V DC / 24V DC", "24V DC", "12V DC / 24V DC"],
          ["Pipe Size Range", "1/4 inch to 1 inch NPT", "1/4 inch to 2 inch NPT", "1/4 inch to 1/2 inch NPT"],
          ["Body Material", "Brass / Stainless Steel", "Brass / Stainless Steel", "Brass / Resin"],
          ["Max Operating Pressure", "10 bar", "16 bar", "8 bar"],
          ["Ingress Protection Rating", "IP54", "NEMA 4 (IP66)", "IP65"],
          ["Coil Power Consumption", "11 W", "9 W to 17 W", "6 W"],
          ["Response Time (Open)", "< 50 ms", "< 40 ms", "< 30 ms"],
          ["Chemical Resistance", "Moderate (Brass)", "Good (Stainless Steel option)", "Good (Resin body)"],
          ["Unit Cost Range", "$45 to $65", "$55 to $80", "$35 to $55"],
          ["Recommended Use", "General water lines", "Industrial harsh environments", "Compact chemical lines"]
        ],
        [2400, 2320, 2320, 2320]
      ),
      blank(),
      pj("Recommendation: The SMC VX21 Series is selected for all dispensing tank inlet valves due to its compact size, superior chemical resistance, fast response time, and lower cost. The ASCO Series 8210 is selected for the main purified water solenoid valve due to its higher ingress protection rating (IP66) and ability to handle higher pressure and flow rates from the elevated tank."),

      h2("2.2 Flow Meters for Precise Volume Measurement"),
      pj("Two flow meters are required: one to measure water flow from the elevated tank (flow range 1–20 L/min) and one to measure chemical flow from the pump (flow range 0.1–2 L/min with high accuracy). The chemical flow meter is more critical because improper dosing concentrations pose patient safety risks."),
      blank(),
      makeTable(
        ["Parameter", "YF-S201 (Seeed)", "OMEGA FTB-300B", "Keyence FD-Q Ultrasonic"],
        [
          ["Measurement Principle", "Hall-effect magnetic pulse", "Paddlewheel rotor", "Clamp-on Ultrasonic"],
          ["Flow Range (L/min)", "1 to 30", "0.5 to 10", "0.05 to 10"],
          ["Accuracy Rating", "±3%", "±1%", "±1.5%"],
          ["Output Signal Type", "Pulse (PWM)", "Frequency pulse", "Analog 4–20 mA"],
          ["Pipe Size / Compatibility", "1/2 inch NPT", "Various pipe adapters", "Clamp-on (any diameter)"],
          ["Wetted Materials", "PVC / Nylon (limited)", "PVDF available", "Non-contact (external only)"],
          ["Power Requirements", "5 V to 24 V DC", "5 V to 24 V DC", "24 V DC"],
          ["Unit Cost Range", "$5 to $10", "$85 to $120", "$280 to $350"],
          ["Best Application", "Water line (low cost)", "Chemical line (high accuracy)", "Non-invasive chemical sensing"]
        ],
        [2400, 2320, 2320, 2320]
      ),
      blank(),
      pj("Recommendation: The YF-S201 is used on the water line where modest accuracy (±3%) is acceptable because water flow is non-critical to final chemical concentration. The OMEGA FTB-300B (with PVDF construction) is selected for the chemical line because its ±1% accuracy directly impacts the final concentration of the disinfectant, which is critical for patient safety compliance."),

      h2("2.3 Variable Rate Chemical Dosing Pump"),
      pj("The chemical pump must accept PWM (Pulse Width Modulation) control signals from the microcontroller to vary the flow rate dynamically. Peristaltic pump designs are preferred because the chemical only contacts the tubing — not internal metal or plastic pump components — ensuring long-term reliability with aggressive chemical solutions."),
      blank(),
      makeTable(
        ["Parameter", "Kamoer NKP Series", "Stenner 45MHP", "ProMinent Gamma L"],
        [
          ["Pump Type / Mechanism", "Peristaltic DC motor", "Peristaltic AC/DC", "Solenoid metering"],
          ["Flow Range (mL/min)", "0.1 to 100", "1 to 45", "1 to 75"],
          ["PWM / Speed Control Support", "Yes (0–100% PWM)", "Yes (voltage control)", "Yes (4–20 mA / PWM)"],
          ["Drive Voltage", "12 V DC / 24 V DC", "12 V DC or 120 V AC", "24 V DC"],
          ["Tubing Material / Resistance", "Silicon / PharMed tubing", "Santoprene tubing", "PVDF wetted parts"],
          ["Max Operating Pressure", "0.3 bar", "0.5 bar", "10 bar (overkill)"],
          ["Repeatability / Accuracy", "±2%", "±3%", "±1% (with feedback)"],
          ["Unit Cost Range", "$35 to $60", "$180 to $250", "$350 to $500"],
          ["Best Use Case", "Low-flow IoT dosing", "Mid-range commercial", "Industrial high-precision"]
        ],
        [2400, 2320, 2320, 2320]
      ),
      blank(),
      pj("Recommendation: The Kamoer NKP Series is selected for this system. It provides direct PWM control, adequate flow range for 10-litre containers, low cost, and excellent compatibility with a wide range of chemical solutions. The silicon tubing is replaced periodically (every 3–6 months) as part of preventive maintenance to maintain accuracy. Real-time flow meter feedback provides closed-loop verification of actual dosing rates."),

      h2("2.4 Dispensing Tank Low-Level Sensors"),
      pj("Each 750 mL dispensing tank requires a single low-level float switch that triggers when chemical volume falls below a threshold (e.g., 150 mL, representing 20% of tank capacity). The sensor must be chemically resistant, reliable, and simple to install."),
      blank(),
      makeTable(
        ["Parameter", "Madison M8000", "Gems Sensors LS-700", "Cynergy3 RSF"],
        [
          ["Switch Type", "Reed / Magnetic float", "Reed / Magnetic float", "Reed switch"],
          ["Max Contact Rating", "10 W @ 0.5 A", "10 W @ 0.5 A", "15 W @ 0.5 A"],
          ["Operating Voltage", "Up to 200 V AC/DC", "Up to 100 V DC", "Up to 200 V AC/DC"],
          ["Housing Material", "Polypropylene (PP)", "Polypropylene / Stainless Steel", "Polypropylene"],
          ["Chemical Compatibility", "Good (PP body)", "Good (PP/SS option)", "Good (PP body)"],
          ["Mounting Configuration", "Side-mount / Top-mount", "Side-mount", "Top or Side-mount"],
          ["Ingress Protection", "IP67 (dust and spray)", "IP67 (dust and spray)", "IP68 (submersion)"],
          ["Cable Length", "300 mm", "200 mm", "500 mm"],
          ["Unit Cost Range", "$15 to $25", "$20 to $35", "$18 to $30"],
          ["Best Application", "General tank sensing", "Chemical-grade environments", "Deep submersion sensing"]
        ],
        [2400, 2320, 2320, 2320]
      ),
      blank(),
      pj("Recommendation: The Gems Sensors LS-700 with polypropylene/stainless steel construction is recommended. It has a proven track record in hospital and laboratory environments with aggressive chemical solutions. The IP67 rating ensures reliability against splash and spray. Each dispensing tank is fitted with one LS-700 mounted on the side wall at the minimum fill level (150 mL mark)."),

      h2("2.5 Additional System Components"),
      blank(),
      makeTable(
        ["Component Type", "Selected Model", "Primary Function", "Est. Cost (USD)"],
        [
          ["Central Controller MCU", "Raspberry Pi 4 (4GB RAM)", "Main processing, MQTT broker, data logging, display", "$55–$75"],
          ["Tank Node MCU", "ESP32 DevKit (dual-core)", "Local sensor/valve control, WiFi, LoRa support", "$8–$15 each"],
          ["Water Level Sensor", "JSN-SR04T Waterproof", "Non-invasive ultrasonic distance to water surface", "$8–$15"],
          ["Chemical Weight Sensor", "20 kg Load Cell + HX711", "Weight-based chemical volume estimation", "$5–$15"],
          ["LoRa Module (Backup)", "HopeRF RFM95W (SX1276)", "Long-range backup communication 915 MHz", "$8–$12 each"],
          ["Status Display", "0.96 inch I2C OLED 128x64", "Digital water level gauge and system status", "$3–$7"],
          ["Relay Modules", "5V 4-channel relay board", "Switching 12V solenoid valves and pumps", "$5–$10 each"],
          ["PWM Motor Driver", "IRF3205 N-Channel MOSFET", "PWM speed control for peristaltic pump", "$2–$5"],
          ["Alarm System", "12V Piezo Buzzer + LEDs", "Audible and visual alarm for fault conditions", "$2–$6"],
          ["Power Supply", "12V 5A Switching PSU", "Central 12V DC supply for all components", "$10–$20"],
          ["Cabling & Connectors", "Assorted industrial-grade", "Waterproof connectors, cable trays", "$80–$150"],
          ["Mixing Chamber", "PVC / Stainless Steel custom", "Turbulent mixing zone for water + chemical", "$50–$100"]
        ],
        [2200, 1600, 3200, 1360]
      ),

      pageBreak(),

      // ══════════════════════════════════════
      // CHAPTER 3: FAULT DETECTION
      // ══════════════════════════════════════
      h1("Chapter 3: Failure Detection and Fail-Safe Methods"),
      pj("This chapter systematically identifies all potential failures that may occur during system operation, describes the detection method for each failure, and specifies the fail-safe actions the system automatically takes to prevent harm, data loss, or chemical hazards."),

      h2("3.1 Comprehensive Failure Mode Analysis"),
      blank(),
      makeTable(
        ["#", "Failure Type", "Detection Method", "Fail-Safe Action"],
        [
          ["1", "Solenoid valve stuck CLOSED", "Flow meter reads zero despite valve-open command; timeout after 5 seconds of operation", "Immediately halt pump, close all valves, log error, trigger alarm, skip to next tank in queue"],
          ["2", "Solenoid valve stuck OPEN", "Flow meter continues to read flow after valve-close command; volume exceeds target by >10%", "Cut pump power instantly via relay, activate secondary mechanical shutoff, trigger critical alarm"],
          ["3", "Chemical pump failure", "Flow meter (FM2) reads zero when pump is commanded to run at >30% PWM for 3+ seconds", "Abort current refill cycle, close all valves, trigger alarm, flag tank as failed, move to next queue item"],
          ["4", "Flow meter reading frozen or stuck", "Flow meter output unchanged for >5 seconds during active pump operation", "Stop all fluid transfers immediately, trigger sensor fault alarm, force manual inspection protocol"],
          ["5", "Chemical pipeline internal leak", "FM2 shows higher flow rate than expected for the PWM setting; load cell weight drops faster than computed", "Close pump and valves instantly, log discrepancy, trigger leak alarm, quarantine chemical container"],
          ["6", "Dispensing tank inlet valve blocked", "FM2 shows flow in main line but no flow at target tank; pipeline back-pressure rises", "Close faulty tank valve, reroute to alternate tank, alert maintenance staff"],
          ["7", "Purified water tank empty/dry", "Ultrasonic sensor reads maximum distance (tank height) or out-of-range", "Immediately halt all refill operations, trigger water-low alarm, send critical alert to operator"],
          ["8", "Chemical container depleted", "Load cell reads at or below tare weight; FM2 shows zero flow at maximum PWM", "Halt all chemical dosing operations, trigger container-empty alarm, log replacement request"],
          ["9", "Low-level sensor malfunction", "Tank was filled recently but sensor continues to report low; or sensor never triggered after long gap", "Log anomaly to fault log, schedule sensor inspection, continue queue with manual oversight"],
          ["10", "Communication loss from tank node", "No MQTT heartbeat message received from node within 60-second timeout window", "Mark tank node as unreachable, skip in queue, send operator alert, attempt reconnection every 30 seconds"],
          ["11", "Over-concentration / chemical imbalance", "Calculated volume ratio of chemical to water deviates by more than ±5% from setpoint", "Abort current batch, flush mixing chamber via emergency valve, re-dose with corrected ratio"],
          ["12", "Power failure or brownout", "Watchdog timer in ESP32 nodes detects loss of heartbeat from main controller", "All valves return to normally-closed state via mechanical springs; no chemical flow possible"]
        ],
        [300, 1800, 2600, 2660]
      ),

      h2("3.2 Fail-Safe Design Principles"),
      pj("The entire system is designed with the following fail-safe principles to prevent chemical hazards, ensure patient safety, and maintain system integrity:"),
      blank(),
      bullet("Normally Closed (NC) Valve Design: All solenoid valves are NC type with mechanical springs. Power loss automatically closes all valves, preventing uncontrolled chemical flow."),
      bullet("Hardware Watchdog Timers: Each ESP32 node and the Raspberry Pi central controller have embedded watchdog timers that trigger a reset if firmware freezes or hangs for more than 10 seconds."),
      bullet("Maximum Fill Time Limits: Each refill operation has a pre-calculated maximum duration based on tank volume and expected pump flow rate. Exceeding this limit (e.g., 120 seconds for a 500 mL dose at typical flow) triggers a timeout fault."),
      bullet("Redundant Level Estimation: Chemical levels are cross-checked between load cell weight and cumulative flow integration. Discrepancies greater than 10% instantly trigger a leak detection alarm."),
      bullet("Real-Time Audible and Visual Alerts: A 12V piezo buzzer and red LED indicators are activated for any fault condition. Alarms remain active until manually acknowledged by an operator."),
      bullet("Graceful Queue Degradation: If a tank refill fails, that tank is removed from the queue, the error is logged, and the system automatically proceeds to serve the next tank. The system does not shut down completely."),
      bullet("MQTT Message Persistence: All critical events (refill requests, completions, faults) are published with QoS 1 (at-least-once delivery) to ensure no data loss in case of temporary network issues."),
      blank(),
      note("The system implements a 'defense in depth' approach with multiple overlapping detection and mitigation strategies, ensuring that no single component failure can cause uncontrolled chemical discharge or patient harm."),

      pageBreak(),

      // ══════════════════════════════════════
      // CHAPTER 4: COMMUNICATION METHODS
      // ══════════════════════════════════════
      h1("Chapter 4: Data Communication Methods"),
      pj("This chapter evaluates two alternative communication methods for transmitting sensor data from the distributed dispensing tank nodes (which are geographically dispersed throughout the hospital) to the central control system, and for sending refill commands back to the nodes."),

      h2("4.1 Communication Method 1: WiFi with MQTT Protocol (Primary)"),
      h3("4.1.1 Technical Architecture"),
      pj("Each dispensing tank node is equipped with an ESP32 microcontroller, which has integrated 802.11 b/g/n WiFi (2.4 GHz). The nodes connect to the hospital's existing WiFi network infrastructure. A lightweight publish-subscribe messaging protocol called MQTT (Message Queuing Telemetry Transport) is used for all inter-node communication. A central MQTT broker (Eclipse Mosquitto) running on the Raspberry Pi acts as the message hub, managing all subscriptions and message routing."),
      blank(),
      pj("Each node publishes status updates to topics such as: 'hospital/tank/01/status', 'hospital/tank/01/level', and 'hospital/tank/01/request-refill'. The central controller subscribes to all tank topics and responds with command messages to 'hospital/tank/01/cmd/open-valve' and 'hospital/tank/01/cmd/close-valve'."),

      h3("4.1.2 Detailed Evaluation"),
      blank(),
      makeTable(
        ["Attribute", "Detail / Performance"],
        [
          ["Coverage Range", "Entire hospital (typical WiFi access points cover 30–100 metres; hospital will have multiple APs)"],
          ["Data Rate Capacity", "Up to 150 Mbps (802.11n) — far exceeds sensor data bandwidth requirements"],
          ["Message Latency", "Very low: 50–100 ms typical for MQTT publish-subscribe; acceptable for non-emergency dosing"],
          ["Power Consumption", "Moderate (~160 mA during WiFi transmission for ESP32); requires wired power in most cases"],
          ["Infrastructure Cost", "Minimal — leverages existing hospital WiFi network; no new infrastructure required"],
          ["Node Hardware Cost", "Very low — ESP32 module costs $8–$15 per node"],
          ["Security Features", "WPA2/WPA3 encryption on WiFi + MQTT over TLS/SSL with username/password authentication"],
          ["Scalability", "Easily supports tens of nodes per single MQTT broker on Raspberry Pi"],
          ["Known Limitations", "Requires stable WiFi coverage in all tank locations; thick concrete walls may cause dead zones"],
          ["MQTT Quality of Service", "QoS 1 (at-least-once) for critical commands; QoS 0 (fire-and-forget) for periodic status"]
        ],
        [2600, 6760]
      ),

      h2("4.2 Communication Method 2: LoRaWAN (Long Range Wide Area Network) — Fallback"),
      h3("4.2.1 Technical Architecture"),
      pj("LoRaWAN uses sub-GHz radio frequencies (868 MHz in Europe, 915 MHz in North America) to provide long-range, low-power communication. Each tank node carries a HopeRF RFM95W LoRa module (based on Semtech SX1276 chipset). A LoRa gateway (e.g., RAK7258 with built-in LoRa and WiFi/Ethernet backhaul) is installed at a central location (e.g., main pharmacy or central hub) and connects to the Raspberry Pi central controller via Ethernet. In a typical large hospital, one gateway per floor or wing is recommended (e.g., 3–5 gateways for a multi-storey hospital)."),
      blank(),
      pj("LoRaWAN uses a star-of-stars topology where all tank nodes communicate directly to the gateway, which forwards messages to the central controller. OTAA (Over-The-Air Activation) ensures secure device provisioning and AES-128 encryption of all payloads."),

      h3("4.2.2 Detailed Evaluation"),
      blank(),
      makeTable(
        ["Attribute", "Detail / Performance"],
        [
          ["Coverage Range", "1–5 km outdoors; 100–500 metres indoors through concrete walls (excellent wall penetration)"],
          ["Data Rate Capability", "0.3–50 kbps (low bandwidth — but sufficient for small sensor packets of 50–100 bytes)"],
          ["Message Latency", "High: 1–5 seconds typical; not suitable for real-time emergency commands"],
          ["Power Consumption", "Very low during sleep (< 10 µA); ~40 mA during transmission (battery-capable)"],
          ["Infrastructure Cost", "LoRa gateway: $80–$200 per unit; 2–5 gateways needed for a hospital"],
          ["Node Hardware Cost", "RFM95W module: $8–$12 plus MCU costs"],
          ["Security & Encryption", "AES-128 encryption (built-in LoRaWAN specification)"],
          ["Scalability", "Supports thousands of nodes per gateway with capacity limits"],
          ["Known Limitations", "Low duty cycle (1% in EU, 0.1% in some regions) limits message frequency; higher latency"],
          ["Payload Size", "Maximum 51–242 bytes per message (sufficient for sensor data)"]
        ],
        [2600, 6760]
      ),

      h2("4.3 Hybrid Approach: WiFi Primary + LoRaWAN Fallback"),
      blank(),
      makeTable(
        ["Selection Criterion", "WiFi + MQTT", "LoRaWAN", "Recommended Use"],
        [
          ["Range", "Moderate (AP-dependent)", "Long (wall-penetrating)", "WiFi for most areas; LoRa for remote/basement"],
          ["Data Rate", "High (overkill)", "Low (adequate)", "WiFi for frequent updates"],
          ["Latency", "Low (< 100 ms)", "High (1–5 seconds)", "WiFi for responsive commands"],
          ["Power", "Moderate", "Very Low", "LoRa for battery-powered backup nodes"],
          ["Infrastructure", "Existing WiFi", "New gateway investment", "Hybrid uses both"],
          ["Cost per Node", "$8–$15", "$13–$22", "WiFi more affordable"],
          ["Security", "WPA2 + TLS", "AES-128 LoRaWAN", "Both robust"],
          ["Best For", "Primary communication", "Fallback / remote areas", "See below"]
        ],
        [3120, 3120, 3120, 3120]
      ),
      blank(),
      pj("Recommendation: A hybrid communication architecture is adopted. WiFi with MQTT serves as the primary communication method for all nodes, leveraging the hospital's existing network infrastructure and providing low latency and high reliability. LoRaWAN serves as a failover mechanism for tanks located in areas with poor WiFi coverage (e.g., basement storage, thick-walled operating theatres, outdoor pump houses)."),
      blank(),
      pj("Each ESP32 tank node is equipped with both a WiFi module and an RFM95W LoRa module. If the WiFi heartbeat is not received by the central controller for more than 60 seconds, the node automatically switches to LoRaWAN mode and begins publishing status updates via the gateway. When WiFi connectivity is restored, the node seamlessly switches back to WiFi operation."),

      pageBreak(),

      // ══════════════════════════════════════
      // CHAPTER 5: SYSTEM BLOCK DIAGRAM
      // ══════════════════════════════════════
      h1("Chapter 5: Complete System Block Diagram"),
      pj("This chapter presents the complete schematic block diagram showing all major hardware components, their interconnections, data flows, and signal paths. The diagram illustrates the three functional layers of the system: the supply side (water and chemical sources), the central control unit, and the distributed dispensing tank nodes."),

      h2("5.1 System Architecture Layers"),
      pj("The system is divided into three functional layers:"),
      blank(),
      bullet("Supply Layer: Purified water elevated tank with ultrasonic level sensor, concentrated chemical container with load cell, chemical dosing pump with flow control, and mixing chamber."),
      bullet("Central Control Layer: Raspberry Pi central controller, local data store (SQLite database), MQTT broker, LoRa gateway, OLED display gauge, and alarm system."),
      bullet("Dispensing Layer: Distributed ESP32 tank nodes (one per tank), low-level float switches, solenoid inlet valves, communication modules (WiFi + LoRa), and local alarm buzzers."),

      h2("5.2 Mermaid.live Block Diagram Code"),
      p("Copy the code below into https://mermaid.live to view and edit the complete system architecture:"),
      blank(),
      ...mermaidBlock([
        "%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#1F4E79', 'lineColor': '#2E75B6'}}}%%",
        "graph TD",
        "  subgraph SUPPLY[\"SUPPLY SIDE: Water & Chemical Sources\"]",
        "    PWT[\"Purified Water Tank<br/>2000 L Elevated Cylindrical\"]",
        "    USS{\"Ultrasonic Sensor<br/>JSN-SR04T<br/>Ext. Top Mount\"}",
        "    SV1[\"Water Solenoid Valve<br/>ASCO 8210<br/>Normally Closed\"]",
        "    FM1{{\"Flow Meter 1<br/>YF-S201<br/>Water Line<br/>1-30 L/min\"}}",
        "    CCT[\"Chemical Supply<br/>10 L Container<br/>on Platform\"]",
        "    LC{{\"Load Cell 20kg<br/>+ HX711 Amp<br/>Weight Sensor\"}},",
        "    CP[\"Peristaltic Pump<br/>Kamoer NKP<br/>PWM Controlled\"]",
        "    FM2{{\"Flow Meter 2<br/>OMEGA FTB-300B<br/>Chemical Line<br/>0.5-10 L/min\"}}",
        "    MC[\"Mixing Chamber<br/>Turbulent Zone<br/>Water + Chemical\"]",
        "    MAINP[\"Distribution Pump<br/>to Dispensing Tanks\"]",
        "  end",
        "",
        "  subgraph CTRL[\"CENTRAL CONTROL UNIT: Raspberry Pi 4\"]",
        "    RPI[\"Raspberry Pi 4<br/>4GB RAM<br/>Main Controller\"]",
        "    DB[(\"SQLite Database<br/>Event Logs<br/>Refill Records\")]",
        "    DISP[\"OLED Display<br/>Water Level Gauge<br/>System Status\"]",
        "    ALM[\"Alarm System<br/>12V Piezo Buzzer<br/>Red LED Indicators\"]",
        "    BROKER[\"MQTT Broker<br/>Eclipse Mosquitto<br/>Message Hub\"]",
        "    LRGW[\"LoRa Gateway<br/>RAK7258<br/>Backup Communication\"]",
        "  end",
        "",
        "  subgraph NODES[\"DISPENSING TANK NODES: Distributed ESP32 Units\"]",
        "    NODE1[\"Tank Node 1<br/>ESP32 + WiFi + LoRa\"]",
        "    DT1[\"Dispensing Tank 1<br/>750 mL\"]",
        "    LS1{\"Float Switch<br/>Gems LS-700<br/>Low-Level\"}",
        "    CV1[\"Inlet Solenoid<br/>SMC VX21<br/>Normally Closed\"]",
        "    ALM1[\"Local Buzzer<br/>Alarm LED\"]",
        "    NODEX[\"...\"]",
        "    NODE20[\"Tank Node 20<br/>ESP32 + WiFi + LoRa\"]",
        "  end",
        "",
        "  PWT --> USS",
        "  USS -->|GPIO Digital| RPI",
        "  PWT --> SV1",
        "  SV1 --> FM1",
        "  FM1 --> MC",
        "  CCT --> LC",
        "  LC -->|SPI/HX711| RPI",
        "  CCT --> CP",
        "  CP -->|Peristaltic| FM2",
        "  FM2 --> MC",
        "  MC --> MAINP",
        "  MAINP --> BROKER",
        "",
        "  RPI --> DB",
        "  RPI --> DISP",
        "  RPI --> ALM",
        "  RPI <-->|TCP/IP| BROKER",
        "  RPI <-->|Ethernet| LRGW",
        "  SV1 -->|Relay GPIO| RPI",
        "  CP -->|PWM MOSFET| RPI",
        "  FM1 -->|Pulse INT| RPI",
        "  FM2 -->|Pulse INT| RPI",
        "",
        "  BROKER <-->|WiFi MQTT| NODE1",
        "  BROKER <-->|WiFi MQTT| NODE20",
        "  LRGW <-.->|LoRa 915MHz| NODE1",
        "  LRGW <-.->|LoRa 915MHz| NODE20",
        "",
        "  NODE1 --> LS1",
        "  LS1 -->|GPIO INT| NODE1",
        "  NODE1 --> CV1",
        "  CV1 -->|Relay| MAINP",
        "  CV1 --> DT1",
        "  NODE1 --> ALM1",
        "  DT1 -.->|Refill Request| BROKER",
        "",
        "  NODE20 --> NODEX"
      ]),

      pageBreak(),

      // ══════════════════════════════════════
      // CHAPTER 6: CONTROLLER SCHEMATICS
      // ══════════════════════════════════════
      h1("Chapter 6: Controller and Sensor Schematics"),
      pj("This chapter presents detailed schematic diagrams showing the pin-level connections of the central Raspberry Pi controller and the distributed ESP32 tank node controllers. Each diagram specifies GPIO pins, signal types, and functional dependencies."),

      h2("6.1 Central Controller (Raspberry Pi 4) Pin Schematic"),
      p("This diagram shows all sensor inputs, actuator outputs, and communication peripherals connected to the Raspberry Pi 4:"),
      blank(),
      ...mermaidBlock([
        "graph LR",
        "  subgraph RPI[\"Raspberry Pi 4 — Central Controller\"]",
        "    GPIO[\"GPIO Header<br/>40-pin\"]",
        "    I2C[\"I2C Bus<br/>SDA GPIO2<br/>SCL GPIO3\"]",
        "    SPI[\"SPI Bus<br/>MOSI GPIO10<br/>MISO GPIO9<br/>SCK GPIO11\"]",
        "    UART[\"UART Serial<br/>Debug Output\"]",
        "    ETH[\"Ethernet RJ45<br/>Gateway Connection\"]",
        "  end",
        "",
        "  subgraph SENSORS[\"Sensor Inputs\"]",
        "    USS[\"Ultrasonic JSN-SR04T<br/>Trig: GPIO17<br/>Echo: GPIO27\"]",
        "    FM1_IN[\"Flow Meter 1 (Water)<br/>Pulse: GPIO22<br/>Interrupt\"]",
        "    FM2_IN[\"Flow Meter 2 (Chem)<br/>Pulse: GPIO23<br/>Interrupt\"]",
        "    HX711_IN[\"Load Cell + HX711<br/>SCK: GPIO5<br/>DT: GPIO6<br/>SPI Protocol\"]",
        "  end",
        "",
        "  subgraph ACTUATORS[\"Actuator Outputs\"]",
        "    RELAY1[\"Relay 1: Water Solenoid<br/>GPIO18 → Relay Module<br/>12V Contact\"]",
        "    RELAY2[\"Relay 2: Main Pump<br/>GPIO24 → Relay Module<br/>12V Contact\"]",
        "    PWM_CTRL[\"PWM MOSFET: Chem Pump<br/>GPIO19 (PWM 50Hz)<br/>Drives IRF3205 Gate\"]",
        "    PWM_OUT[\"Chemical Pump Motor<br/>0-100% Speed\"]",
        "  end",
        "",
        "  subgraph DISPLAY_ALARM[\"Display & Alarm\"]",
        "    OLED[\"OLED 128×64<br/>I2C Address 0x27<br/>SDA: GPIO2<br/>SCL: GPIO3\"]",
        "    BUZZER[\"12V Buzzer<br/>GPIO25 via NPN Transistor\"]",
        "    LED[\"Red Alarm LED<br/>GPIO26 + 220Ω Resistor\"]",
        "  end",
        "",
        "  subgraph COMMS[\"Communication & Storage\"]",
        "    WIFI[\"Onboard WiFi<br/>802.11n 2.4GHz<br/>MQTT via TCP/IP\"]",
        "    SDCARD[\"USB Adapter → SD Card<br/>Local Database (SQLite)\"]",
        "  end",
        "",
        "  USS -->|GPIO17 GPIO27| GPIO",
        "  FM1_IN -->|GPIO22| GPIO",
        "  FM2_IN -->|GPIO23| GPIO",
        "  HX711_IN -->|GPIO5 GPIO6| SPI",
        "  GPIO -->|GPIO18| RELAY1",
        "  GPIO -->|GPIO24| RELAY2",
        "  GPIO -->|GPIO19 PWM| PWM_CTRL",
        "  PWM_CTRL --> PWM_OUT",
        "  I2C -->|0x27| OLED",
        "  GPIO -->|GPIO25| BUZZER",
        "  GPIO -->|GPIO26| LED",
        "  WIFI -.->|TCP/IP| COMMS",
        "  ETH -->|Ethernet| COMMS"
      ]),

      h2("6.2 Tank Node (ESP32) Pin Schematic"),
      p("Each dispensing tank node uses an ESP32 DevKit with the following connections:"),
      blank(),
      ...mermaidBlock([
        "graph LR",
        "  subgraph ESP[\"ESP32 DevKit — Tank Node MCU\"]",
        "    CORE[\"Dual-Core CPU<br/>240 MHz\"]",
        "    GPIO_ESP[\"GPIO Pins<br/>28 Total\"]",
        "    SPI_ESP[\"SPI Bus\"]",
        "    I2C_ESP[\"I2C Bus\"]",
        "    WIFI_ESP[\"WiFi 802.11n<br/>2.4GHz\"]",
        "    LORA_ESP[\"LoRa Support<br/>via RFM95W\"]",
        "    ADC[\"12-bit ADC<br/>Analog Input\"]",
        "  end",
        "",
        "  subgraph SENSORS_LOCAL[\"Local Sensors\"]",
        "    LS[\"Float Switch<br/>Gems LS-700<br/>GPIO34 INPUT\"]",
        "    HB[\"Heartbeat LED<br/>GPIO2 OUTPUT\"]",
        "  end",
        "",
        "  subgraph ACTUATORS_LOCAL[\"Actuators\"]",
        "    CV[\"Inlet Solenoid Valve<br/>GPIO26 via Relay Module<br/>12V Contact\"]",
        "    BUZL[\"Local Buzzer<br/>GPIO27 Piezo\"]",
        "  end",
        "",
        "  subgraph LORA_MOD[\"LoRa Backup Module\"]",
        "    RFM[\"HopeRF RFM95W<br/>SX1276 Chipset\"]",
        "    PINS[\"SPI Pins:<br/>SCK: GPIO18<br/>MISO: GPIO19<br/>MOSI: GPIO23<br/>CS: GPIO5\"]",
        "  end",
        "",
        "  CORE --> GPIO_ESP",
        "  LS -->|GPIO34| GPIO_ESP",
        "  GPIO_ESP -->|GPIO26| CV",
        "  GPIO_ESP -->|GPIO27| BUZL",
        "  GPIO_ESP -->|GPIO2| HB",
        "  SPI_ESP --> PINS",
        "  PINS --> RFM",
        "  WIFI_ESP <-.->|2.4GHz| LORA_MOD",
        "  LORA_ESP <-.->|915MHz| RFM"
      ]),

      pageBreak(),

      // ══════════════════════════════════════
      // CHAPTER 7: STATE DIAGRAMS
      // ══════════════════════════════════════
      h1("Chapter 7: State Diagrams and Operational Algorithms"),
      pj("This chapter presents the operational state machines and flow charts describing the logic executed by each major component: the central controller and the distributed tank nodes. These diagrams are essential for understanding the system's behaviour during normal operation, queue management, and fault handling."),

      h2("7.1 Tank Node Finite State Machine"),
      p("Each ESP32 tank node transitions through the following states:"),
      blank(),
      ...mermaidBlock([
        "stateDiagram-v2",
        "  direction LR",
        "  [*] --> INIT: Power On",
        "  INIT --> IDLE: WiFi connected +<br/>MQTT subscribed",
        "  IDLE --> REQUEST_SENT: Float sensor<br/>triggered LOW",
        "  REQUEST_SENT --> WAITING: Refill request<br/>published to broker",
        "  WAITING --> IDLE: Request REJECTED<br/>System busy - retry<br/>in 30 seconds",
        "  WAITING --> FILLING: ACCEPTED:<br/>Fill permission<br/>from controller",
        "  FILLING --> FILL_MONITOR: Local valve<br/>opened",
        "  FILL_MONITOR --> FILL_COMPLETE: Fill-complete<br/>signal received",
        "  FILL_MONITOR --> FAULT_LOCAL: Timeout<br/>exceeded<br/>120 seconds",
        "  FILL_COMPLETE --> IDLE: Valve closed +<br/>ACK sent",
        "  FAULT_LOCAL --> IDLE: Alarm + valve<br/>force-closed +<br/>operator ack",
        "  IDLE --> HEARTBEAT: Every 30s",
        "  HEARTBEAT --> IDLE: Status published",
        "  IDLE --> COMM_LOST: No MQTT<br/>ACK for 60s",
        "  COMM_LOST --> LORA_MODE: Switch to<br/>LoRa backup",
        "  LORA_MODE --> IDLE: WiFi restored"
      ]),

      h2("7.2 Central Controller State Machine"),
      blank(),
      ...mermaidBlock([
        "stateDiagram-v2",
        "  [*] --> STARTUP: Boot",
        "  STARTUP --> INIT_SENSORS: Initialize all<br/>sensors & timers",
        "  INIT_SENSORS --> MONITORING: Ready for operation",
        "  MONITORING --> ALARM_STATE: Fault detected<br/>water/chem low/<br/>valve stuck/<br/>leak detected",
        "  ALARM_STATE --> MONITORING: Operator<br/>acknowledges<br/>& clears fault",
        "  MONITORING --> QUEUE_CHECK: Periodic check",
        "  QUEUE_CHECK --> IDLE_CHK{Any refill<br/>requests<br/>queued?}",
        "  IDLE_CHK -->|No| MONITORING",
        "  IDLE_CHK -->|Yes| BUSY_CHK{System<br/>already<br/>dosing?}",
        "  BUSY_CHK -->|Yes| MONITORING",
        "  BUSY_CHK -->|No| DOSING: Start refill cycle<br/>Send fill-permission",
        "  DOSING --> DOSING: Monitor FM1 &<br/>FM2 flow rates",
        "  DOSING --> DOSE_COMPLETE{Target<br/>volume<br/>reached?}",
        "  DOSE_COMPLETE -->|No| TIMEOUT_CHK{Timeout<br/>exceeded?}",
        "  TIMEOUT_CHK -->|No| DOSING",
        "  TIMEOUT_CHK -->|Yes| ALARM_STATE: Fault",
        "  DOSE_COMPLETE -->|Yes| CLOSE_VALVES: Close valves",
        "  CLOSE_VALVES --> LOG_RECORD: Log refill record",
        "  LOG_RECORD --> MONITORING"
      ]),

      h2("7.3 Central Controller Operational Flow Chart"),
      blank(),
      ...mermaidBlock([
        "flowchart TD",
        "  START([\"System Power On\"]) --> INIT[\"Initialize:<br/>Load sensor calibration<br/>Connect to MQTT broker<br/>Load queue from database\"]",
        "  INIT --> MONITOR[\"Main Loop:<br/>Continuously read all sensors<br/>Update displays\"]",
        "",
        "  MONITOR --> W{\"Water level<br/>below threshold?<br/>&lt; 200 L\"}",
        "  W -->|Yes| WA[\"ALERT: Water Low<br/>Trigger alarm<br/>Log event<br/>Halt refill queue\"]",
        "  WA --> MONITOR",
        "  W -->|No| CH{\"Chemical level<br/>below threshold?\"}",
        "  CH -->|Yes| CA[\"ALERT: Chemical Low<br/>Trigger alarm<br/>Log event\"]",
        "  CA --> MONITOR",
        "  CH -->|No| Q{\"Refill request<br/>in FIFO queue?\"}",
        "  Q -->|No| LOG[\"Log sensor readings<br/>Update OLED display<br/>Check report schedule\"]",
        "  LOG --> MONITOR",
        "",
        "  Q -->|Yes| BUSY{\"System currently<br/>dosing to tank?\"}",
        "  BUSY -->|Yes| MONITOR",
        "  BUSY -->|No| NEXT[\"Dequeue next tank ID<br/>Verify pre-conditions<br/>- Water > 200L<br/>- Chemical > dose volume\"]",
        "",
        "  NEXT --> NXTOK{\"All checks<br/>passed?\"}",
        "  NXTOK -->|No| REJECT[\"Reject request<br/>Return to queue\"]",
        "  REJECT --> MONITOR",
        "  NXTOK -->|Yes| SEND[\"Send fill-permission<br/>MQTT to tank node\"]",
        "  SEND --> OWV[\"Open water solenoid<br/>GPIO18 relay\"]",
        "  OWV --> CALC_PWM[\"Calculate pump PWM<br/>based on flow targets\"]",
        "  CALC_PWM --> SPUMP[\"Start chemical pump<br/>Set GPIO19 PWM duty\"]",
        "  SPUMP --> OTV[\"Send open-valve<br/>command to tank node\"]",
        "  OTV --> FLOWMON[\"Monitor FM1 & FM2<br/>Update every 100ms\"]",
        "",
        "  FLOWMON --> FANOM{\"Flow rate<br/>abnormal?\"}",
        "  FANOM -->|Yes| FAULT[\"FAULT DETECTED<br/>Close all valves<br/>Stop pump<br/>Trigger alarm\"]",
        "  FAULT --> LOG_FAULT[\"Log fault details<br/>Skip tank in queue\"]",
        "  LOG_FAULT --> MONITOR",
        "",
        "  FANOM -->|No| TVOL{\"Cumulative volume<br/>from FM2 ≥ target?\"}",
        "  TVOL -->|No| TOUT{\"Elapsed time<br/>exceed max?\"}",
        "  TOUT -->|Yes| FAULT",
        "  TOUT -->|No| FLOWMON",
        "",
        "  TVOL -->|Yes| CLOSE[\"Close water valve<br/>Stop chemical pump<br/>Send close-valve to node\"]",
        "  CLOSE --> UPDATE[\"Update chemical & water<br/>levels in database\"]",
        "  UPDATE --> REPORT[\"Log fill record:<br/>Tank ID + volume + timestamp + conc\"]",
        "  REPORT --> MONITOR"
      ]),

      h2("7.4 Tank Node Operational Flow Chart"),
      blank(),
      ...mermaidBlock([
        "flowchart TD",
        "  NS([\"Node Power On\"]) --> NWIFI[\"Connect to WiFi<br/>Load LoRa fallback settings\"]",
        "  NWIFI --> NSUB[\"Subscribe to MQTT topics:<br/>hospital/tank/XX/cmd/*\"]",
        "  NSUB --> NIDLE[\"Enter IDLE state<br/>Enable float switch GPIO34\"]",
        "",
        "  NIDLE --> NFLOAT{\"Float switch<br/>triggered LOW?\"}",
        "  NFLOAT -->|No| NHB{\"30-second<br/>heartbeat<br/>interval?\"}",
        "  NHB -->|No| NIDLE",
        "  NHB -->|Yes| PUBHB[\"Publish heartbeat:<br/>hospital/tank/XX/status<br/>Include node ID + WiFi signal\"]",
        "  PUBHB --> NIDLE",
        "",
        "  NFLOAT -->|Yes| PREQ[\"Publish refill-request:<br/>hospital/tank/XX/request-refill<br/>QoS 1 at-least-once\"]",
        "  PREQ --> NWAIT[\"Wait for response<br/>Timeout: 300 seconds\"]",
        "  NWAIT --> NRESP{\"Response<br/>received?\"}",
        "",
        "  NRESP -->|Rejected| NRETRY[\"Rejection reason: System busy<br/>Wait 30 seconds<br/>Re-publish request\"]",
        "  NRETRY --> NWAIT",
        "",
        "  NRESP -->|Permitted| NOPENVALVE[\"Open local inlet valve<br/>GPIO26 relay activated\"]",
        "  NOPENVALVE --> NFILLWAIT{\"Fill-complete<br/>signal from<br/>controller?\"}",
        "  NFILLWAIT -->|No| NTOUT{\"120-second<br/>timeout<br/>exceeded?\"}",
        "  NTOUT -->|Yes| NFAULT[\"FAULT: Timeout<br/>Force close valve<br/>Publish fault alert<br/>Activate local buzzer GPIO27\"]",
        "  NFAULT --> NIDLE",
        "  NTOUT -->|No| NFILLWAIT",
        "",
        "  NFILLWAIT -->|Yes| NCLOSEV[\"Close inlet valve<br/>GPIO26 relay released\"]",
        "  NCLOSEV --> NACK[\"Publish completion ACK:<br/>hospital/tank/XX/fill-complete\"]",
        "  NACK --> NIDLE"
      ]),

      pageBreak(),

      // ══════════════════════════════════════
      // CHAPTER 8: WOKWI SIMULATION
      // ══════════════════════════════════════
      h1("Chapter 8: System Simulation and Prototype Implementation"),
      pj("This chapter describes the simulation and prototype of the system using the WokWi online embedded systems simulator. The simulation models a single dispensing tank node and demonstrates the core logic of chemical dosing, valve control, alarm generation, and fault detection. This allows validation of the algorithm logic before deploying to real hardware."),

      h2("8.1 Simulation Scope and Limitations"),
      pj("The WokWi simulation includes the following functional components:"),
      bullet("ESP32 DevKit microcontroller (acts as both central controller and tank node in simulation)"),
      bullet("HC-SR04 ultrasonic sensor (simulates water level measurement in the supply tank)"),
      bullet("Push button (simulates the float switch triggering when tank level is low)"),
      bullet("SG90 servo motor (simulates solenoid valve opening and closing)"),
      bullet("Red LED (visual alarm indicator for faults)"),
      bullet("Active buzzer (audible alarm generation)"),
      bullet("16x2 I2C LCD display (shows water level, chemical level, and system status)"),
      bullet("Serial monitor output (simulates MQTT messages and debug logs)"),
      blank(),
      pj("The simulation does NOT include actual chemical mixing, flow rate verification, or multi-tank queue management. It demonstrates the core logic for a single tank scenario and proves the feasibility of the control algorithm."),

      h2("8.2 WokWi Simulation Code (Arduino ESP32)"),
      p("The following well-commented Arduino code runs on the simulated ESP32:"),
      blank(),
      ...mermaidBlock([
        "// ════════════════════════════════════════════════════════════════════════════",
        "// Hospital Chemical Dosing System - WokWi Simulation",
        "// Single Dispensing Tank Scenario - Arduino / ESP32",
        "// ════════════════════════════════════════════════════════════════════════════",
        "",
        "#include <LiquidCrystal_I2C.h>",
        "#include <Servo.h>",
        "",
        "// ─── PIN DEFINITIONS ────────────────────────────────────────────────────────",
        "#define TRIG_PIN    5     // Ultrasonic Trig (Water Tank Level)",
        "#define ECHO_PIN    18    // Ultrasonic Echo",
        "#define FLOAT_PIN   34    // Float Switch (Active LOW)",
        "#define VALVE_PIN   26    // Servo simulating solenoid valve",
        "#define ALARM_PIN   27    // LED Alarm Indicator",
        "#define BUZZ_PIN    14    // Piezo Buzzer",
        "",
        "// ─── TANK CONFIGURATION ─────────────────────────────────────────────────────",
        "#define TANK_HEIGHT_CM   180.0    // Water tank height (cm)",
        "#define TANK_RADIUS_CM   25.0     // Water tank radius (cm)",
        "#define TARGET_DOSE_ML   500.0    // Target refill volume (mL)",
        "#define LOW_WATER_L      200.0    // Water low threshold (litres)",
        "#define LOW_CHEMICAL_ML  500.0    // Chemical low threshold (mL)",
        "#define FILL_TIMEOUT_MS  15000    // Max fill time (milliseconds)",
        "",
        "// ─── OBJECTS ────────────────────────────────────────────────────────────────",
        "LiquidCrystal_I2C lcd(0x27, 16, 2);   // I2C OLED 16x2",
        "Servo inletValve;                     // Servo for solenoid simulation",
        "",
        "// ─── GLOBAL STATE VARIABLES ─────────────────────────────────────────────────",
        "enum SystemState { IDLE, REQUEST_SENT, FILLING, FAULT, ALARM };",
        "SystemState sysState = IDLE;",
        "",
        "float waterLevelLitres = 1800.0;      // Current water volume (L)",
        "float chemicalRemainML = 9500.0;      // Current chemical volume (mL)",
        "float volumeDosedML = 0.0;            // Volume dosed in current cycle",
        "unsigned long fillStartTime = 0;      // Timestamp of fill start",
        "bool tankLowDetected = false;         // Float switch state",
        "bool commLost = false;                // WiFi/MQTT communication status",
        "",
        "// ═══════════════════════════════════════════════════════════════════════════",
        "// SETUP: Initialize all peripherals",
        "// ═══════════════════════════════════════════════════════════════════════════",
        "void setup() {",
        "  Serial.begin(115200);",
        "  delay(1000);  // Wait for Serial to stabilize",
        "",
        "  // Initialize display",
        "  lcd.init();",
        "  lcd.backlight();",
        "  lcd.setCursor(0, 0);",
        "  lcd.print(\"Chem Dos Sys v1\");",
        "  lcd.setCursor(0, 1);",
        "  lcd.print(\"Init...\");",
        "",
        "  // Initialize GPIO pins",
        "  pinMode(TRIG_PIN, OUTPUT);",
        "  pinMode(ECHO_PIN, INPUT);",
        "  pinMode(FLOAT_PIN, INPUT_PULLUP);   // Float switch active LOW",
        "  pinMode(ALARM_PIN, OUTPUT);",
        "  pinMode(BUZZ_PIN, OUTPUT);",
        "  digitalWrite(ALARM_PIN, LOW);",
        "  noTone(BUZZ_PIN);",
        "",
        "  // Initialize servo",
        "  inletValve.attach(VALVE_PIN);",
        "  inletValve.write(0);                // Start with valve closed",
        "",
        "  Serial.println(\"[SYSTEM] Hospital Chemical Dosing System Initialised\");",
        "  Serial.println(\"[CONFIG] Tank capacity: 750 mL | Target dose: 500 mL\");",
        "  Serial.println(\"[READY] System ready. Waiting for refill request...\");",
        "",
        "  delay(2000);",
        "}",
        "",
        "// ═══════════════════════════════════════════════════════════════════════════",
        "// Function: Read water level via HC-SR04 ultrasonic sensor",
        "// Returns: Water volume in litres",
        "// ═══════════════════════════════════════════════════════════════════════════",
        "float readWaterLevel() {",
        "  // Send 10 microsecond pulse to trigger pin",
        "  digitalWrite(TRIG_PIN, LOW);",
        "  delayMicroseconds(2);",
        "  digitalWrite(TRIG_PIN, HIGH);",
        "  delayMicroseconds(10);",
        "  digitalWrite(TRIG_PIN, LOW);",
        "",
        "  // Measure echo pulse duration",
        "  long duration = pulseIn(ECHO_PIN, HIGH, 30000);  // 30ms timeout",
        "  if (duration == 0) return 0;  // Timeout = no reading",
        "",
        "  // Calculate distance: speed of sound = 0.034 cm/µs",
        "  float distanceCm = (duration * 0.034) / 2.0;",
        "",
        "  // Water height = tank height - sensor distance",
        "  float waterHeightCm = TANK_HEIGHT_CM - distanceCm;",
        "  if (waterHeightCm < 0) waterHeightCm = 0;",
        "  if (waterHeightCm > TANK_HEIGHT_CM) waterHeightCm = TANK_HEIGHT_CM;",
        "",
        "  // Volume = π × r² × h (convert cm³ to litres: divide by 1000)",
        "  float volume = (3.14159 * TANK_RADIUS_CM * TANK_RADIUS_CM * waterHeightCm) / 1000.0;",
        "  return volume;",
        "}",
        "",
        "// ═══════════════════════════════════════════════════════════════════════════",
        "// Function: Trigger alarm on fault condition",
        "// ═══════════════════════════════════════════════════════════════════════════",
        "void triggerAlarm(String message) {",
        "  sysState = ALARM;",
        "  digitalWrite(ALARM_PIN, HIGH);  // Red LED ON",
        "  tone(BUZZ_PIN, 1000, 3000);     // 1 kHz buzzer for 3 seconds",
        "",
        "  Serial.println(\"[ALARM] \" + message);",
        "",
        "  lcd.clear();",
        "  lcd.setCursor(0, 0);",
        "  lcd.print(\"!!! ALARM !!!\");",
        "  lcd.setCursor(0, 1);",
        "  lcd.print(message.substring(0, 16));",
        "",
        "  delay(5000);  // Buzzer duration + user visibility",
        "",
        "  digitalWrite(ALARM_PIN, LOW);   // LED OFF",
        "  inletValve.write(0);             // Force close valve",
        "  sysState = IDLE;",
        "}",
        "",
        "// ═══════════════════════════════════════════════════════════════════════════",
        "// Function: Perform complete fill cycle for one tank",
        "// ═══════════════════════════════════════════════════════════════════════════",
        "void performFillCycle() {",
        "  Serial.println(\"[CTRL] Fill cycle STARTED for Tank. Target: \" +",
        "                 String(TARGET_DOSE_ML) + \" mL\");",
        "  Serial.println(\"[MQTT] Sending: hospital/tank/01/cmd/open-valve\");",
        "",
        "  lcd.clear();",
        "  lcd.setCursor(0, 0);",
        "  lcd.print(\"Filling Tank...\");",
        "",
        "  // Open inlet valve (servo to 90 degrees = fully open)",
        "  inletValve.write(90);",
        "  fillStartTime = millis();",
        "  volumeDosedML = 0.0;",
        "  sysState = FILLING;",
        "",
        "  // Simulate dosing with flow rate feedback",
        "  // Simulated flow rate: 33 mL/s (realistic for peristaltic pump at med speed)",
        "  while (volumeDosedML < TARGET_DOSE_ML) {",
        "    // ─── FAULT CHECK 1: Timeout ─────────────────────────────────",
        "    if ((millis() - fillStartTime) > FILL_TIMEOUT_MS) {",
        "      inletValve.write(0);  // Close valve immediately",
        "      triggerAlarm(\"Fill Timeout!\");",
        "      return;",
        "    }",
        "",
        "    // ─── Simulate flow metering ─────────────────────────────────",
        "    volumeDosedML += 33.0;   // Simulated 33 mL per second",
        "    chemicalRemainML -= 33.0;",
        "",
        "    // Prevent negative chemical volume",
        "    if (chemicalRemainML < 0) chemicalRemainML = 0;",
        "",
        "    // ─── Display progress ───────────────────────────────────────",
        "    lcd.setCursor(0, 1);",
        "    lcd.print(\"Vol: \");",
        "    lcd.print((int)volumeDosedML);",
        "    lcd.print(\"/\");",
        "    lcd.print((int)TARGET_DOSE_ML);",
        "    lcd.print(\" mL \");",
        "",
        "    Serial.print(\"[FLOW] Dosed: \");",
        "    Serial.print(volumeDosedML, 1);",
        "    Serial.println(\" mL\");",
        "",
        "    delay(1000);  // Simulate 1-second measurement interval",
        "  }",
        "",
        "  // ─── FILL COMPLETE ──────────────────────────────────────────────",
        "  inletValve.write(0);  // Close valve",
        "  sysState = IDLE;",
        "",
        "  Serial.println(\"[CTRL] Fill COMPLETE. Valve closed.\");",
        "  Serial.println(\"[DATA] Chemical remaining: \" + String(chemicalRemainML / 1000.0, 2) + \" L\");",
        "  Serial.println(\"[MQTT] Published: hospital/tank/01/fill-complete\");",
        "}",
        "",
        "// ═══════════════════════════════════════════════════════════════════════════",
        "// MAIN LOOP: Continuous monitoring and control",
        "// ═══════════════════════════════════════════════════════════════════════════",
        "void loop() {",
        "  // ─── READ SENSORS ───────────────────────────────────────────────────",
        "  waterLevelLitres = readWaterLevel();",
        "  bool floatTriggered = (digitalRead(FLOAT_PIN) == LOW);",
        "",
        "  // ─── CHECK WATER LEVEL ──────────────────────────────────────────────",
        "  if (waterLevelLitres < LOW_WATER_L && sysState == IDLE) {",
        "    Serial.println(\"[WARN] Water level CRITICAL: \" + String(waterLevelLitres, 1) + \" L\");",
        "    lcd.clear();",
        "    lcd.setCursor(0, 0);",
        "    lcd.print(\"WATER CRITICAL!\");",
        "    lcd.setCursor(0, 1);",
        "    lcd.print(String(waterLevelLitres, 0) + \" L remain\");",
        "    digitalWrite(ALARM_PIN, HIGH);",
        "    delay(2000);",
        "    digitalWrite(ALARM_PIN, LOW);",
        "  }",
        "",
        "  // ─── CHECK CHEMICAL LEVEL ──────────────────────────────────────────",
        "  if (chemicalRemainML < LOW_CHEMICAL_ML && sysState == IDLE) {",
        "    Serial.println(\"[WARN] Chemical level LOW: \" + String(chemicalRemainML, 1) + \" mL\");",
        "    digitalWrite(ALARM_PIN, HIGH);",
        "    delay(1000);",
        "    digitalWrite(ALARM_PIN, LOW);",
        "  }",
        "",
        "  // ─── NORMAL DISPLAY (when not filling) ──────────────────────────────",
        "  if (sysState == IDLE) {",
        "    lcd.clear();",
        "    lcd.setCursor(0, 0);",
        "    lcd.print(\"W:\" + String(waterLevelLitres, 0) + \"L \");",
        "    lcd.print(\"C:\" + String(chemicalRemainML / 1000.0, 1) + \"L\");",
        "    lcd.setCursor(0, 1);",
        "    lcd.print(\"Status: Ready\");",
        "  }",
        "",
        "  // ─── FLOAT SWITCH TRIGGERED: REQUEST REFILL ─────────────────────────",
        "  if (floatTriggered && sysState == IDLE) {",
        "    Serial.println(\"[NODE] Float switch TRIGGERED — Tank level is LOW\");",
        "    Serial.println(\"[MQTT] Publishing: hospital/tank/01/request-refill\");",
        "    sysState = REQUEST_SENT;",
        "    delay(500);",
        "",
        "    // Pre-condition checks",
        "    if (waterLevelLitres < LOW_WATER_L) {",
        "      Serial.println(\"[CTRL] Refill REJECTED — Water supply low\");",
        "      sysState = IDLE;",
        "    } else if (chemicalRemainML < TARGET_DOSE_ML) {",
        "      triggerAlarm(\"Chem Empty!\");",
        "    } else {",
        "      Serial.println(\"[CTRL] Refill ACCEPTED — Pre-checks passed\");",
        "      Serial.println(\"[MQTT] Sending: hospital/tank/01/cmd/open-valve\");",
        "      performFillCycle();",
        "    }",
        "  }",
        "",
        "  delay(500);  // Main loop sample rate: 2 Hz",
        "}",
        "// ═══════════════════════════════════════════════════════════════════════════"
      ]),

      h2("8.3 WokWi Component List"),
      pj("To simulate this system on WokWi, add the following components to your diagram:"),
      blank(),
      bullet("1× ESP32 DevKit (main microcontroller)"),
      bullet("1× HC-SR04 Ultrasonic Sensor (GPIO5 Trig, GPIO18 Echo)"),
      bullet("1× Push Button with 10k pull-down (GPIO34, simulates float switch)"),
      bullet("1× SG90 Servo Motor (GPIO26, simulates solenoid valve)"),
      bullet("1× Red LED with 220 ohm resistor (GPIO27, alarm indicator)"),
      bullet("1× Active Piezo Buzzer (GPIO14, 12V rated)"),
      bullet("1× 16×2 I2C LCD Display (I2C address 0x27, SDA GPIO21, SCL GPIO22)"),
      blank(),
      p("Simulation URL: Visit https://wokwi.com and paste the circuit diagram JSON to load this simulation. The code above runs directly on the simulated ESP32. The serial monitor displays all system messages, MQTT-style event logs, and state transitions in real time."),

      pageBreak(),

      // ══════════════════════════════════════
      // COST ESTIMATE
      // ══════════════════════════════════════
      h1("Appendix A: Comprehensive Bill of Materials and Cost Analysis"),
      pj("The following table provides a detailed bill of materials for a hospital facility with 20 dispensing tanks. All costs are approximate retail/distributor pricing as of May 2026. For volume orders (> 50 units), expect 10–20% price reductions."),
      blank(),
      makeTable(
        ["Component", "Unit Cost (USD)", "Quantity", "Extended Cost (USD)"],
        [
          ["Raspberry Pi 4 (4GB) — Central Controller", "65", "1", "65"],
          ["ESP32 DevKit — Tank Node MCUs", "12", "20", "240"],
          ["JSN-SR04T Waterproof Ultrasonic Sensor", "12", "1", "12"],
          ["Load Cell 20kg + HX711 Amplifier", "10", "1", "10"],
          ["ASCO 8210 Solenoid Valve — Water", "65", "1", "65"],
          ["SMC VX21 Solenoid Valve — Tank Inlets", "45", "20", "900"],
          ["YF-S201 Water Flow Meter", "8", "1", "8"],
          ["OMEGA FTB-300B Chemical Flow Meter", "100", "1", "100"],
          ["Kamoer NKP Peristaltic Pump", "50", "1", "50"],
          ["Gems Sensors LS-700 Float Switch", "25", "20", "500"],
          ["HopeRF RFM95W LoRa Module", "10", "20", "200"],
          ["RAK7258 LoRa Gateway (2 units)", "120", "2", "240"],
          ["0.96in I2C OLED Display Module", "5", "1", "5"],
          ["5V 4-Channel Relay Module", "8", "5", "40"],
          ["IRF3205 N-Channel MOSFET + Driver", "3", "5", "15"],
          ["12V Piezo Buzzer", "3", "5", "15"],
          ["Red LED + Resistor Kit", "1", "20", "20"],
          ["12V 5A Switching Power Supply", "18", "5", "90"],
          ["Industrial Wiring & Connectors", "100", "1", "100"],
          ["Mixing Chamber (Fabricated PVC/SS)", "80", "1", "80"],
          ["Installation, Calibration & Testing", "500", "1", "500"],
          ["TOTAL SYSTEM COST", "", "", "≈ $3,715"]
        ],
        [3200, 1600, 1000, 1400]
      ),
      blank(),
      pj("This cost estimate is for a single hospital facility deployment with 20 dispensing tanks. Additional costs to consider: ongoing maintenance and tubing replacement (~$50/month), annual LoRa data plan (~$200), and staff training (~$500 one-time). For a multi-year contract with volume orders, the per-unit component cost could be reduced by 15–25%, bringing the total system cost to approximately $3,000–$3,200."),

      pageBreak(),

      // ══════════════════════════════════════
      // CONCLUSION & RECOMMENDATIONS
      // ══════════════════════════════════════
      h1("Appendix B: Implementation Recommendations"),
      h2("B.1 Phased Deployment Strategy"),
      pj("A phased approach to system deployment is recommended:"),
      blank(),
      bullet("Phase 1 (Weeks 1–4): Install central controller, database, MQTT broker, and primary comms infrastructure. Test with 5 pilot dispensing tanks."),
      bullet("Phase 2 (Weeks 5–8): Calibrate all sensors, validate flow meter accuracy, and test fault detection logic with pilot tanks."),
      bullet("Phase 3 (Weeks 9–12): Deploy remaining 15 tanks, train hospital staff on alarm response and system maintenance, establish daily and weekly reporting routines."),
      bullet("Phase 4 (Ongoing): Monitor system performance, collect usage data, refine algorithms based on operational feedback, and plan for future expansion."),

      h2("B.2 Maintenance and Support"),
      pj("Recommended preventive maintenance includes: monthly inspection of solenoid valves and piping for leaks, quarterly replacement of peristaltic pump tubing, semi-annual calibration of flow meters, and annual review of database logs for trend analysis and anomaly detection."),

      h2("B.3 Future Enhancements"),
      pj("The system architecture supports future enhancements such as: machine learning-based anomaly detection for early failure prediction, integration with hospital management information systems (HIS) for automatic reporting, mobile app for operators to check tank status remotely, and automatic reordering of chemical containers based on consumption trends."),

      pageBreak(),

      // ══════════════════════════════════════
      // REFERENCES
      // ══════════════════════════════════════
      h1("References"),
      bullet("Burkert Fluid Control Systems. (2024). Type 6013 Solenoid Valve Datasheet."),
      bullet("ASCO Valve Inc. (2024). Series 8210 General Purpose Solenoid Valve Manual."),
      bullet("SMC Corporation. (2024). VX21 Series Solenoid Valve Specification Sheet."),
      bullet("Gems Sensors & Controls. (2024). LS-700 Series Float Switch Technical Guide."),
      bullet("OMEGA Engineering. (2024). FTB-300B Paddlewheel Flow Meter User Manual."),
      bullet("Kamoer Fluid Technology. (2024). NKP Series Peristaltic Pump Documentation."),
      bullet("HopeRF Electronics. (2024). RFM95W LoRa Module Datasheet (SX1276)."),
      bullet("Espressif Systems. (2024). ESP32 Technical Reference Manual and Datasheet."),
      bullet("Raspberry Pi Foundation. (2024). Raspberry Pi 4 Hardware Documentation."),
      bullet("Eclipse Foundation. (2024). Mosquitto MQTT Broker Official Documentation."),
      bullet("LoRa Alliance. (2024). LoRaWAN Specification Version 1.0.4."),
      bullet("RAK Wireless. (2024). RAK7258 Indoor LoRaWAN Gateway Datasheet."),
      bullet("SeeedStudio. (2024). YF-S201 Hall-Effect Flow Meter Specifications."),
      bullet("SparkFun Electronics. (2024). HX711 Load Cell Amplifier Hookup Guide."),
      blank(),
      blank(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 100 },
        children: [new TextRun({ text: "END OF REPORT", size: 20, font: "Arial", color: C.DGREY, italics: true })]
      }),
      blank(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: "Document Version 2.0 | May 2026", size: 18, font: "Arial", color: C.DGREY })]
      }),

    ]
  }]
});

// ─── GENERATE AND SAVE DOCUMENT ───────────────────────────────────────────────
Packer.toBuffer(doc).then(buffer => {
  const outPath = path.join(__dirname, 'Hospital_Chemical_Dosing_IoT_Report_Complete.docx');
  fs.writeFileSync(outPath, buffer);
  console.log('\n✓ Report generated successfully!');
  console.log('✓ File: ' + outPath);
  console.log('✓ Sections included: 8 Chapters + Appendices');
  console.log('✓ Mermaid diagrams: System block diagram, schematics, state machines, flowcharts');
  console.log('✓ WokWi simulation code: Fully documented Arduino ESP32 code');
  console.log('✓ Cost analysis: Complete BOM with 20-tank deployment estimate');
}).catch(err => {
  console.error('Error generating report:', err);
  process.exit(1);
});
