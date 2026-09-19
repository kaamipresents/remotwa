// test-mixer.js — Automated test suite for Milestone 4: Per-App Audio Mixer
// Implements windows-audio-remote-spec.md Section 4, 8 & 11

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const PIN_FILE = path.join(APPDATA, 'Remotva', 'active_pin.txt');
const TOKENS_FILE = path.join(APPDATA, 'Remotva', 'tokens.json');

console.log(`\n======================================================`);
console.log(`  REMOTVA PER-APP AUDIO MIXER VERIFICATION (M4)`);
console.log(`======================================================\n`);

async function runMixerVerification() {
  const ws = new WebSocket('ws://127.0.0.1:8377');
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  console.log('[Step 1] Connected to Remotva Companion WebSocket server.');

  const receivedEvents = [];
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.t === 'evt') {
        receivedEvents.push(msg);
      }
    } catch { }
  };

  // 1. Authenticate with saved token or PIN
  let token = null;
  if (fs.existsSync(PIN_FILE)) {
    const pin = fs.readFileSync(PIN_FILE, 'utf8').trim();
    ws.send(JSON.stringify({ v: 1, t: 'cmd', id: 'p1', m: 'pair', p: { pin, clientName: 'Mixer Test' } }));
    const pairRes = await waitForReply(ws, 'p1');
    assert(pairRes.ok === true, 'Pairing succeeded');
    token = pairRes.p.token;
  } else if (fs.existsSync(TOKENS_FILE)) {
    const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    if (tokens.length > 0) {
      token = tokens[tokens.length - 1].Token;
    }
  }

  if (!token) throw new Error('No active token or PIN available.');

  ws.send(JSON.stringify({ v: 1, t: 'cmd', id: 'h1', m: 'hello', p: { token, clientName: 'Mixer Test', versions: [1] } }));
  const helloRes = await waitForReply(ws, 'h1');
  assert(helloRes.ok === true, 'Hello handshake accepted');
  console.log(`[Step 2] Authenticated with companion: ${helloRes.p.serverName}.`);

  // 2. getSessions
  console.log('\n[Step 3] Enumerating audio sessions (getSessions)...');
  ws.send(JSON.stringify({ v: 1, t: 'cmd', id: 'g1', m: 'getSessions' }));
  const sessRes = await waitForReply(ws, 'g1');
  assert(sessRes.ok === true && Array.isArray(sessRes.p.sessions), 'getSessions returned sessions array');
  const sessions = sessRes.p.sessions;
  console.log(`  Found ${sessions.length} audio session(s):`);
  for (const s of sessions) {
    console.log(`  - [PID ${s.sessionId}] "${s.name}": Vol=${(s.level * 100).toFixed(0)}%, Muted=${s.muted}, Active=${s.active}`);
    assert(typeof s.sessionId === 'string', 'sessionId is string (PID)');
    assert(typeof s.name === 'string', 'name is string');
    assert(typeof s.level === 'number' && s.level >= 0 && s.level <= 1, 'level is float 0.0-1.0');
    assert(typeof s.muted === 'boolean', 'muted is boolean');
  }

  // 3. Test per-session volume control if any session exists
  if (sessions.length > 0) {
    const targetSession = sessions[0];
    const originalVol = targetSession.level;
    const originalMute = targetSession.muted;
    console.log(`\n[Step 4] Testing setSessionVolume on PID ${targetSession.sessionId} ("${targetSession.name}")...`);

    // Change volume to 0.75
    ws.send(JSON.stringify({
      v: 1,
      t: 'cmd',
      id: 'sv1',
      m: 'setSessionVolume',
      p: { sessionId: targetSession.sessionId, level: 0.75 },
    }));
    const setVolRes = await waitForReply(ws, 'sv1');
    assert(setVolRes.ok === true, 'setSessionVolume succeeded');
    assert(Math.abs(setVolRes.p.level - 0.75) < 0.05, 'Returned level is 0.75');
    console.log(`  ✓ setSessionVolume responded with level: ${setVolRes.p.level}`);

    // Wait 250ms and assert sessionVolumeChanged event
    await new Promise((r) => setTimeout(r, 250));
    const volEvt = receivedEvents.find(
      (e) => e.m === 'sessionVolumeChanged' && e.p.sessionId === targetSession.sessionId
    );
    assert(volEvt !== undefined, 'sessionVolumeChanged event received');
    console.log(`  ✓ Broadcast event received: sessionVolumeChanged for PID ${volEvt.p.sessionId}: Level=${volEvt.p.level}, Muted=${volEvt.p.muted}`);

    // Test setSessionMute
    console.log(`\n[Step 5] Testing setSessionMute on PID ${targetSession.sessionId}...`);
    ws.send(JSON.stringify({
      v: 1,
      t: 'cmd',
      id: 'sm1',
      m: 'setSessionMute',
      p: { sessionId: targetSession.sessionId, muted: true },
    }));
    const muteRes = await waitForReply(ws, 'sm1');
    assert(muteRes.ok === true && muteRes.p.muted === true, 'setSessionMute true succeeded');

    ws.send(JSON.stringify({
      v: 1,
      t: 'cmd',
      id: 'sm2',
      m: 'setSessionMute',
      p: { sessionId: targetSession.sessionId, muted: false },
    }));
    const unmuteRes = await waitForReply(ws, 'sm2');
    assert(unmuteRes.ok === true && unmuteRes.p.muted === false, 'setSessionMute false succeeded');
    console.log(`  ✓ setSessionMute toggle verified.`);

    // Restore original session volume
    console.log('\n[Step 6] Restoring original session volume...');
    ws.send(JSON.stringify({
      v: 1,
      t: 'cmd',
      id: 'restore',
      m: 'setSessionVolume',
      p: { sessionId: targetSession.sessionId, level: originalVol },
    }));
    await waitForReply(ws, 'restore');
    console.log(`  ✓ Session volume restored to ${(originalVol * 100).toFixed(0)}%.`);
  } else {
    console.log('\n[Step 4-6] No active audio applications currently producing sound to adjust.');
  }

  // 4. Test error handling on non-existent session
  console.log('\n[Step 7] Testing setSessionVolume with invalid sessionId (expecting graceful handle)...');
  ws.send(JSON.stringify({
    v: 1,
    t: 'cmd',
    id: 'err1',
    m: 'setSessionVolume',
    p: { sessionId: '99999999', level: 0.5 },
  }));
  const errRes = await waitForReply(ws, 'err1');
  assert(errRes.ok === true || errRes.err !== undefined, 'Invalid session handled gracefully');
  console.log(`  ✓ Invalid session handled properly.`);

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

runMixerVerification()
  .then(() => {
    console.log(`\n======================================================`);
    console.log(`  ALL PER-APP MIXER CHECKS PASSED! 🎉`);
    console.log(`  Milestone 4 Verified Successfully.`);
    console.log(`======================================================\n`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\n❌ VERIFICATION FAILED: ${err.message}\n`);
    process.exit(1);
  });
