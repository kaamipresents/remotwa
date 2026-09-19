// test-client.js — Automated test client for Remotva Companion WebSocket server
// Uses Node 22 native WebSocket and fs

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const WS_URL = process.env.REMOTVA_URL || 'ws://127.0.0.1:8377';
const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const PIN_FILE = path.join(APPDATA, 'Remotva', 'active_pin.txt');

console.log(`\n========================================`);
console.log(`  REMOTVA COMPANION TEST SUITE (M1)`);
console.log(`  Connecting to: ${WS_URL}`);
console.log(`========================================\n`);

let messageIdCounter = 1;
const pendingRequests = new Map();
const receivedEvents = [];

function nextId() {
  return `req_${messageIdCounter++}`;
}

function runTests() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);

    const timeout = setTimeout(() => {
      reject(new Error('Test suite timed out after 30s'));
    }, 30000);

    function sendCommand(method, payload = null) {
      return new Promise((res, rej) => {
        const id = nextId();
        const envelope = {
          v: 1,
          t: 'cmd',
          id: id,
          m: method,
          p: payload
        };

        const timer = setTimeout(() => {
          pendingRequests.delete(id);
          rej(new Error(`Timeout waiting for reply to ${method} (${id})`));
        }, 5000);

        pendingRequests.set(id, (reply) => {
          clearTimeout(timer);
          res(reply);
        });

        ws.send(JSON.stringify(envelope));
      });
    }

    ws.onopen = async () => {
      console.log('✅ WebSocket connected successfully.\n');

      try {
        // Test 1: ping
        console.log('[Test 1] Testing ping...');
        const pingRes = await sendCommand('ping');
        assert(pingRes.ok === true, 'Ping response ok === true');
        assert(pingRes.p && pingRes.p.serverTime, 'Ping returned serverTime');
        console.log(`  ✓ Ping succeeded. Server time: ${new Date(pingRes.p.serverTime).toISOString()}`);

        // Test 2: Unauthenticated hello should fail with ERR_AUTH
        console.log('\n[Test 2] Testing unauthenticated hello (expecting ERR_AUTH)...');
        const unauthHello = await sendCommand('hello', { token: 'invalid_dummy_token', clientName: 'NodeTest' });
        assert(unauthHello.ok === false, 'Unauthenticated hello rejected');
        assert(unauthHello.err === 'ERR_AUTH', 'Error code is ERR_AUTH');
        console.log(`  ✓ Unauthenticated hello correctly rejected: ${unauthHello.msg}`);

        // Test 3: Invalid PIN pairing should fail
        console.log('\n[Test 3] Testing invalid PIN pairing...');
        const badPair = await sendCommand('pair', { pin: '000000', clientName: 'NodeTest' });
        assert(badPair.ok === false, 'Invalid PIN pairing rejected');
        console.log(`  ✓ Invalid PIN rejected: ${badPair.msg}`);

        // Test 4: Check if active pairing session exists
        console.log('\n[Test 4] Reading active PIN and completing pairing...');
        let activePin = null;
        for (let i = 0; i < 20; i++) {
          if (fs.existsSync(PIN_FILE)) {
            activePin = fs.readFileSync(PIN_FILE, 'utf8').trim();
            if (activePin) break;
          }
          await new Promise(r => setTimeout(r, 250));
        }

        if (!activePin) {
          throw new Error(`Active PIN file not found at ${PIN_FILE}. Did you start companion with --start-pairing or click 'Pair' in tray?`);
        }
        console.log(`  Found active pairing PIN: ${activePin}`);

        const pairRes = await sendCommand('pair', { pin: activePin, clientName: 'NodeTest Automated Client' });
        assert(pairRes.ok === true, 'Pairing succeeded');
        assert(pairRes.p && pairRes.p.token, 'Received token');
        const token = pairRes.p.token;
        const deviceId = pairRes.p.deviceId;
        console.log(`  ✓ Pairing succeeded! Token: ${token.substring(0, 12)}... (length ${token.length})`);
        console.log(`  ✓ Device ID: ${deviceId}`);

        // Test 5: Authenticated hello with issued token
        console.log('\n[Test 5] Testing authenticated hello with token...');
        const authHello = await sendCommand('hello', { token: token, clientName: 'NodeTest' });
        assert(authHello.ok === true, 'Authenticated hello succeeded');
        assert(authHello.p.serverName, 'ServerName returned');
        console.log(`  ✓ Hello accepted! Server: ${authHello.p.serverName}, protocol v: ${authHello.p.v}`);

        // Test 6: getState snapshot
        console.log('\n[Test 6] Testing getState snapshot...');
        const stateRes = await sendCommand('getState');
        assert(stateRes.ok === true, 'getState succeeded');
        assert(stateRes.p.master, 'Master volume state present');
        const originalLevel = stateRes.p.master.level;
        const originalMute = stateRes.p.master.muted;
        console.log(`  ✓ Current master volume: ${(originalLevel * 100).toFixed(1)}%, muted: ${originalMute}`);
        console.log(`  ✓ Active audio sessions: ${stateRes.p.sessions ? stateRes.p.sessions.length : 0}`);

        // Test 7: setVolume & volumeChanged event
        console.log('\n[Test 7] Testing setVolume to 0.42 and awaiting volumeChanged event...');
        const setVolRes = await sendCommand('setVolume', { level: 0.42 });
        assert(setVolRes.ok === true, 'setVolume succeeded');
        assert(Math.abs(setVolRes.p.level - 0.42) < 0.05, 'Returned level is close to 0.42');
        console.log(`  ✓ setVolume responded with level: ${setVolRes.p.level}`);

        // Give event 300ms to arrive
        await new Promise(r => setTimeout(r, 300));
        const volEvt = receivedEvents.find(e => e.m === 'volumeChanged');
        assert(volEvt !== undefined, 'volumeChanged event received by client');
        console.log(`  ✓ Received volumeChanged broadcast event: level=${volEvt.p.level}, muted=${volEvt.p.muted}`);

        // Test 8: setMute
        console.log('\n[Test 8] Testing setMute toggle...');
        const muteRes = await sendCommand('setMute', { muted: true });
        assert(muteRes.ok === true && muteRes.p.muted === true, 'Mute set to true');
        const unmuteRes = await sendCommand('setMute', { muted: false });
        assert(unmuteRes.ok === true && unmuteRes.p.muted === false, 'Mute restored to false');
        console.log(`  ✓ setMute toggle verified.`);

        // Test 9: adjustVolume relative step
        console.log('\n[Test 9] Testing adjustVolume (delta: -0.05)...');
        const adjRes = await sendCommand('adjustVolume', { delta: -0.05 });
        assert(adjRes.ok === true, 'adjustVolume succeeded');
        console.log(`  ✓ adjustVolume succeeded. New level: ${adjRes.p.level}`);

        // Test 10: getSessions
        console.log('\n[Test 10] Testing getSessions...');
        const sessRes = await sendCommand('getSessions');
        assert(sessRes.ok === true && Array.isArray(sessRes.p.sessions), 'getSessions returned array');
        console.log(`  ✓ Sessions retrieved: ${sessRes.p.sessions.length} session(s)`);
        for (const s of sessRes.p.sessions.slice(0, 5)) {
          console.log(`    - [${s.sessionId}] ${s.name}: Vol=${(s.level * 100).toFixed(0)}%, Muted=${s.muted}, Active=${s.active}`);
        }

        // Cleanup: Restore original volume
        console.log('\n[Cleanup] Restoring original volume...');
        await sendCommand('setVolume', { level: originalLevel });
        await sendCommand('setMute', { muted: originalMute });
        console.log(`  ✓ Master volume restored to ${(originalLevel * 100).toFixed(1)}%.`);

        clearTimeout(timeout);
        ws.close();
        resolve();
      } catch (err) {
        clearTimeout(timeout);
        ws.close();
        reject(err);
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.t === 'res' && msg.id) {
          const handler = pendingRequests.get(msg.id);
          if (handler) {
            pendingRequests.delete(msg.id);
            handler(msg);
          }
        } else if (msg.t === 'evt') {
          receivedEvents.push(msg);
        }
      } catch (e) {
        console.error('Error parsing incoming message:', e);
      }
    };

    ws.onerror = (err) => {
      reject(new Error(`WebSocket connection error: ${err.message || err}`));
    };
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

runTests()
  .then(() => {
    console.log(`\n========================================`);
    console.log(`  ALL 10 TESTS PASSED SUCCESSFULLY! 🎉`);
    console.log(`  Milestone 1 Companion Core is Verified.`);
    console.log(`========================================\n`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\n❌ TEST FAILED: ${err.message}\n`);
    process.exit(1);
  });
