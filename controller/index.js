const aedes = require('aedes')();
const net = require('net');
const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');

const BROKER_PORT = 1883;
const LOG_FILE = path.join(__dirname, '..', 'controller.log');

function log(...args) {
  const line = `[${new Date().toISOString()}] ` + args.join(' ');
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// Start embedded MQTT broker (Aedes)
const server = net.createServer(aedes.handle);
server.listen(BROKER_PORT, function () {
  log('MQTT broker started on port', BROKER_PORT);
});

// Controller MQTT client connects to the same broker
const client = mqtt.connect(`mqtt://localhost:${BROKER_PORT}`);

// In-memory state
const refillQueue = [];
let dosing = false;
const tanks = {}; // per-tank status cache

function enqueueRefill(tankId, msg) {
  refillQueue.push({ tankId, msg, ts: Date.now() });
  log(`Enqueued refill for ${tankId} (queue length: ${refillQueue.length})`);
  processQueue();
}

function processQueue() {
  if (dosing) return;
  const item = refillQueue.shift();
  if (!item) return;
  dosing = true;
  const { tankId } = item;
  handleRefill(tankId).finally(() => {
    dosing = false;
    setImmediate(processQueue);
  });
}

async function handleRefill(tankId) {
  log('Handling refill for', tankId);
  const targetVolume = 500; // mL as per document

  // Pre-checks (simplified): check supply status if known
  const status = tanks[tankId] || {};
  if (status.waterLevelLitres && status.waterLevelLitres < 200) {
    log(`Rejecting refill ${tankId}: water low (${status.waterLevelLitres} L)`);
    client.publish(`hospital/tank/${tankId}/cmd`, JSON.stringify({ action: 'reject', reason: 'water_low' }));
    return;
  }
  if (status.chemicalRemainML && status.chemicalRemainML < targetVolume) {
    log(`Rejecting refill ${tankId}: chemical low (${status.chemicalRemainML} mL)`);
    client.publish(`hospital/tank/${tankId}/cmd`, JSON.stringify({ action: 'reject', reason: 'chem_low' }));
    return;
  }

  // Send permission to open valve and start dosing
  client.publish(`hospital/tank/${tankId}/cmd`, JSON.stringify({ action: 'open-valve', targetML: targetVolume }));
  log(`Command sent: open-valve -> ${tankId}`);

  // Wait for fill-complete or timeout
  const timeoutMs = 120000; // 120s
  let resolved = false;

  const onFill = (payload) => {
    if (resolved) return;
    resolved = true;
    log(`Fill complete received for ${tankId}: ${payload}`);
    client.publish(`hospital/tank/${tankId}/cmd`, JSON.stringify({ action: 'close-valve' }));
  };

  const fillTopic = `hospital/tank/${tankId}/fill-complete`;
  client.once('message', function handler(topic, message) {
    if (topic === fillTopic) {
      try { onFill(message.toString()); } catch (e) { log('fill handler error', e); }
    }
  });

  const start = Date.now();
  // Poll for timeout
  while (!resolved && Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 500));
  }
  if (!resolved) {
    log(`Refill timeout for ${tankId}`);
    client.publish(`hospital/tank/${tankId}/cmd`, JSON.stringify({ action: 'close-valve', reason: 'timeout' }));
  }
}

client.on('connect', () => {
  log('Controller connected to broker');
  client.subscribe('hospital/tank/+/request-refill');
  client.subscribe('hospital/tank/+/status');
  client.subscribe('hospital/tank/+/heartbeat');
  client.subscribe('hospital/tank/+/fill-complete');
});

client.on('message', (topic, message) => {
  const parts = topic.split('/');
  // topic: hospital/tank/{id}/...
  if (parts.length < 4) return;
  const tankId = parts[2];
  const action = parts[3];
  const payload = message.toString();

  try {
    const data = JSON.parse(payload);
    if (action === 'request-refill') {
      enqueueRefill(tankId, data);
    } else if (action === 'status') {
      tanks[tankId] = { ...tanks[tankId], ...data, lastSeen: Date.now() };
      log(`Status update ${tankId}:`, JSON.stringify(data));
    } else if (action === 'heartbeat') {
      tanks[tankId] = { ...tanks[tankId], heartbeat: Date.now() };
    } else if (action === 'fill-complete') {
      log(`Fill-complete received topic for ${tankId}: ${payload}`);
      // write a small record
      fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} FILL_COMPLETE ${tankId} ${payload}\n`);
    }
  } catch (e) {
    log('Malformed payload on', topic, payload);
  }
});

// Basic health log
setInterval(() => {
  const now = new Date().toISOString();
  log('Controller heartbeat - queue:', refillQueue.length, 'dosing:', dosing);
}, 60000);

// Graceful shutdown
process.on('SIGINT', () => {
  log('Shutting down controller and broker');
  server.close(() => process.exit(0));
  aedes.close();
});
