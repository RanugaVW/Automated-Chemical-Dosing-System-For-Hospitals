const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');

const BROKER = 'mqtt://localhost:1883';
const client = mqtt.connect(BROKER);

const tankId = process.argv[2] || '01';
const autoRequest = process.argv.includes('--request');

function log(...args) { console.log(new Date().toISOString(), ...args); }

client.on('connect', () => {
  log('Simulator connected as tank', tankId);
  client.subscribe(`hospital/tank/${tankId}/cmd`);
  // publish periodic status / heartbeat
  setInterval(() => {
    client.publish(`hospital/tank/${tankId}/status`, JSON.stringify({ waterLevelLitres: 1800, chemicalRemainML: 9500 }));
    client.publish(`hospital/tank/${tankId}/heartbeat`, JSON.stringify({ ts: Date.now() }));
  }, 5000);

  if (autoRequest) {
    setTimeout(() => {
      log('Auto publishing refill request');
      client.publish(`hospital/tank/${tankId}/request-refill`, JSON.stringify({ reason: 'float_low' }));
    }, 2000);
  }
});

client.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    log('CMD received', topic, payload);
    if (payload.action === 'open-valve') {
      // simulate dosing by emitting flow updates and finally fill-complete
      const target = payload.targetML || 500;
      simulateDosing(target);
    } else if (payload.action === 'close-valve') {
      log('Close valve command received');
    } else if (payload.action === 'reject') {
      log('Request rejected:', payload.reason);
    }
  } catch (e) {
    log('Invalid CMD payload', e);
  }
});

function simulateDosing(targetML) {
  log('Simulating dosing target', targetML, 'mL');
  let dosed = 0;
  const ratePerSecond = 33; // mL/s as in the doc
  const interval = setInterval(() => {
    dosed += ratePerSecond;
    if (dosed > targetML) dosed = targetML;
    client.publish(`hospital/tank/${tankId}/flow`, JSON.stringify({ dosedML: dosed }));
    log(`Flow update: ${dosed}/${targetML} mL`);
    if (dosed >= targetML) {
      clearInterval(interval);
      client.publish(`hospital/tank/${tankId}/fill-complete`, JSON.stringify({ totalML: dosed }));
      log('Published fill-complete');
    }
  }, 1000);
}

process.on('SIGINT', () => { log('Simulator exiting'); client.end(true, () => process.exit(0)); });
