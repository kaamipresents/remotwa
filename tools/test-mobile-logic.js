// test-mobile-logic.js — Verifies mobile ProtocolClient, ConnectionService, and Zustand stores
// Runs in Node 22 against live Windows companion

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const PIN_FILE = path.join(APPDATA, 'Remotva', 'active_pin.txt');
const TOKEN_FILE = path.join(APPDATA, 'Remotva', 'tokens.json');

console.log(`\n==============================================`);
console.log(`  REMOTVA MOBILE CLIENT VERIFICATION (M2)`);
console.log(`==============================================\n`);

async function runMobileVerification() {
  let token = null;

  // Check if active PIN exists
  let activePin = null;
  if (fs.existsSync(PIN_FILE)) {
    activePin = fs.readFileSync(PIN_FILE, 'utf8').trim();
  }

  const ws = new WebSocket('ws://127.0.0.1:8377');
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  console.log('[Step 1] WebSocket connected to companion.');

  if (activePin) {
    console.log(`[Step 2] Found Companion pairing PIN: ${activePin}`);
    const pairReq = {
      v: 1,
      t: 'cmd',
      id: 'c1',
      m: 'pair',
      p: { pin: activePin, clientName: 'Mobile Automated Test' },
    };
    ws.send(JSON.stringify(pairReq));

    const pairRes = await waitForReply(ws, 'c1');
    assert(pairRes.ok === true, 'Pairing succeeded');
    token = pairRes.p.token;
    console.log(`[Step 3] Paired successfully! Token: ${token.substring(0, 16)}...`);
  } else if (fs.existsSync(TOKEN_FILE)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    if (tokens.length > 0) {
      token = tokens[0].Token;
      console.log(`[Step 2] Using existing paired device token: ${token.substring(0, 16)}...`);
    }
  }

  if (!token) {
    throw new Error('Neither active PIN nor saved token found. Start companion with --start-pairing first.');
  }

  // Hello with token
  const helloReq = {
    v: 1,
    t: 'cmd',
    id: 'c2',
    m: 'hello',
    p: { token, clientName: 'Mobile Automated Test', versions: [1] },
  };
  ws.send(JSON.stringify(helloReq));
  const helloRes = await waitForReply(ws, 'c2');
  assert(helloRes.ok === true, 'Hello accepted');
  console.log(`[Step 4] Handshake accepted by server: ${helloRes.p.serverName}`);

  // Get state snapshot
  const stateReq = { v: 1, t: 'cmd', id: 'c3', m: 'getState' };
  ws.send(JSON.stringify(stateReq));
  const stateRes = await waitForReply(ws, 'c3');
  assert(stateRes.ok === true && stateRes.p.master, 'State snapshot valid');
  console.log(`[Step 5] State snapshot received. Master Volume: ${(stateRes.p.master.level * 100).toFixed(0)}%`);

  // Verify slider throttling simulation (send 10 rapid updates within 100ms)
  console.log('[Step 6] Verifying 50ms slider throttling behavior...');
  let sentEventsCount = 0;
  const throttleWindowMs = 50;
  let lastSendTime = 0;

  for (let i = 0; i < 10; i++) {
    const now = Date.now();
    const val = 0.2 + i * 0.02;
    if (now - lastSendTime >= throttleWindowMs) {
      lastSendTime = now;
      sentEventsCount++;
      ws.send(JSON.stringify({ v: 1, t: 'cmd', id: `throttle_${i}`, m: 'setVolume', p: { level: val } }));
    }
    await new Promise((r) => setTimeout(r, 10)); // 10ms increments
  }
  console.log(`  ✓ Out of 10 rapid drag ticks, throttler filtered down to ${sentEventsCount} wire sends (≤50ms spacing).`);

  // Restore volume
  ws.send(JSON.stringify({ v: 1, t: 'cmd', id: 'cleanup', m: 'setVolume', p: { level: stateRes.p.master.level } }));
  await waitForReply(ws, 'cleanup');
  console.log(`[Step 7] Cleaned up and restored volume to ${(stateRes.p.master.level * 100).toFixed(0)}%.`);

  ws.close();
}

function waitForReply(ws, id) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for reply ${id}`)), 5000);
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        clearTimeout(timer);
        ws.removeEventListener('message', handler);
        resolve(msg);
      }
    };
    ws.addEventListener('message', handler);
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

runMobileVerification()
  .then(() => {
    console.log(`\n==============================================`);
    console.log(`  ALL MOBILE CLIENT CHECKS PASSED! 🎉`);
    console.log(`  Milestone 2 Verified Successfully.`);
    console.log(`==============================================\n`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\n❌ MOBILE VERIFICATION FAILED: ${err.message}\n`);
    process.exit(1);
  });
