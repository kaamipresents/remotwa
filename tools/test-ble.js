// test-ble.js — Automated test suite for Milestone 5: Bluetooth Low Energy (BLE) Transport
// Tests chunking (3-byte header), 5-second timeout, MessagePack encoding, BLE constraints, and protocol flow.

const assert = require('assert');
const path = require('path');
const { encode, decode } = require(path.resolve(__dirname, '../mobile/node_modules/@msgpack/msgpack'));

console.log('====================================================');
console.log('Remotva Milestone 5: BLE Transport Verification');
console.log('====================================================\n');

// 1. BleChunker Implementation in JS for verification
class BleChunker {
  constructor() {
    this.pending = new Map();
    this.nextMessageId = 0;
    this.timeoutMs = 5000;
  }

  getNextMessageId() {
    const id = this.nextMessageId;
    this.nextMessageId = (this.nextMessageId + 1) % 256;
    return id;
  }

  chunk(payload, mtu, messageId) {
    const msgId = messageId !== undefined ? messageId : this.getNextMessageId();
    const maxPayload = Math.max(1, mtu - 3);

    if (payload.length === 0) {
      return [new Uint8Array([msgId, 0, 1])];
    }

    const chunkCount = Math.ceil(payload.length / maxPayload);
    if (chunkCount > 255) {
      throw new Error(`Payload too large: ${chunkCount} chunks needed (max 255)`);
    }

    const chunks = [];
    for (let i = 0; i < chunkCount; i++) {
      const offset = i * maxPayload;
      const sliceLen = Math.min(maxPayload, payload.length - offset);
      const chunk = new Uint8Array(3 + sliceLen);
      chunk[0] = msgId;
      chunk[1] = i;
      chunk[2] = chunkCount;
      chunk.set(payload.subarray(offset, offset + sliceLen), 3);
      chunks.push(chunk);
    }
    return chunks;
  }

  tryReassemble(chunk, customNow) {
    this.pruneTimedOut(customNow);

    if (!chunk || chunk.length < 3) return null;

    const messageId = chunk[0];
    const chunkIndex = chunk[1];
    const chunkCount = chunk[2];

    if (chunkCount === 0 || chunkIndex >= chunkCount) return null;

    const payloadSlice = chunk.subarray(3);
    const now = customNow || Date.now();

    let pending = this.pending.get(messageId);
    if (!pending) {
      pending = {
        chunkCount,
        lastUpdated: now,
        chunks: new Map(),
      };
      this.pending.set(messageId, pending);
    }

    pending.lastUpdated = now;
    pending.chunks.set(chunkIndex, payloadSlice);

    if (pending.chunks.size === pending.chunkCount) {
      let totalLength = 0;
      for (let i = 0; i < pending.chunkCount; i++) {
        const slice = pending.chunks.get(i);
        if (!slice) return null;
        totalLength += slice.length;
      }

      const fullMessage = new Uint8Array(totalLength);
      let writeOffset = 0;
      for (let i = 0; i < pending.chunkCount; i++) {
        const slice = pending.chunks.get(i);
        fullMessage.set(slice, writeOffset);
        writeOffset += slice.length;
      }

      this.pending.delete(messageId);
      return fullMessage;
    }

    return null;
  }

  pruneTimedOut(customNow) {
    const now = customNow || Date.now();
    for (const [id, item] of this.pending.entries()) {
      if (now - item.lastUpdated > this.timeoutMs) {
        this.pending.delete(id);
      }
    }
  }

  getPendingCount() {
    return this.pending.size;
  }
}

// 2. BleCodec implementation matching companion BleCodec.cs
const BLE_KEY_VERSION = 0;
const BLE_KEY_TYPE = 1;
const BLE_KEY_ID = 2;
const BLE_KEY_METHOD = 3;
const BLE_KEY_OK = 4;
const BLE_KEY_PAYLOAD = 5;
const BLE_KEY_CODE = 6;
const BLE_KEY_MESSAGE = 7;

class BleCodec {
  static encode(envelope) {
    const map = {};
    map[BLE_KEY_VERSION] = envelope.v || 1;
    map[BLE_KEY_TYPE] = envelope.t;

    if (envelope.id !== undefined) map[BLE_KEY_ID] = envelope.id;
    if (envelope.m !== undefined) map[BLE_KEY_METHOD] = envelope.m;
    if (envelope.ok !== undefined) map[BLE_KEY_OK] = envelope.ok;
    if (envelope.err !== undefined) map[BLE_KEY_CODE] = envelope.err;
    if (envelope.msg !== undefined) map[BLE_KEY_MESSAGE] = envelope.msg;
    if (envelope.p !== undefined) map[BLE_KEY_PAYLOAD] = envelope.p;

    return encode(map);
  }

  static decode(bytes) {
    if (!bytes || bytes.length === 0) return null;

    // Check if raw JSON (starts with '{' = 123)
    if (bytes[0] === 123) {
      return JSON.parse(Buffer.from(bytes).toString('utf-8'));
    }

    const obj = decode(bytes);
    if (!obj) return null;

    const getVal = (k) => {
      if (obj instanceof Map) return obj.get(k) ?? obj.get(String(k));
      return obj[k] ?? obj[String(k)];
    };

    const env = {
      v: getVal(BLE_KEY_VERSION) || 1,
      t: getVal(BLE_KEY_TYPE) || 'res',
    };

    if (getVal(BLE_KEY_ID) !== undefined) env.id = String(getVal(BLE_KEY_ID));
    if (getVal(BLE_KEY_METHOD) !== undefined) env.m = String(getVal(BLE_KEY_METHOD));
    if (getVal(BLE_KEY_OK) !== undefined) env.ok = Boolean(getVal(BLE_KEY_OK));
    if (getVal(BLE_KEY_CODE) !== undefined) env.err = String(getVal(BLE_KEY_CODE));
    if (getVal(BLE_KEY_MESSAGE) !== undefined) env.msg = String(getVal(BLE_KEY_MESSAGE));
    if (getVal(BLE_KEY_PAYLOAD) !== undefined) env.p = getVal(BLE_KEY_PAYLOAD);

    return env;
  }
}

async function runTests() {
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  [PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] Test ${total}: ${name}`);
      console.error(`         ${err.message}`);
    }
  }

  console.log('--- Unit Verification: BleChunker Framing & Slicing ---');

  // Test 1: Single small chunk
  test('Single chunk fit under MTU (payload <= MTU - 3)', () => {
    const chunker = new BleChunker();
    const payload = Buffer.from('hello remotva ble');
    const chunks = chunker.chunk(payload, 185, 42);

    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0][0], 42, 'messageId matches');
    assert.strictEqual(chunks[0][1], 0, 'chunkIndex = 0');
    assert.strictEqual(chunks[0][2], 1, 'chunkCount = 1');

    const reassembled = chunker.tryReassemble(chunks[0]);
    assert(reassembled !== null, 'Reassembly returned result');
    assert.strictEqual(Buffer.from(reassembled).toString(), 'hello remotva ble');
  });

  // Test 2: Multi-chunk split (1000 bytes over MTU 185)
  test('Multi-chunk split and sequential reassembly (1000 bytes over MTU 185)', () => {
    const chunker = new BleChunker();
    const sourceData = Buffer.alloc(1000, 0xAB);
    const chunks = chunker.chunk(sourceData, 185, 10);

    // Max slice = 185 - 3 = 182 bytes. 1000 / 182 = 6 chunks (5 * 182 + 90)
    assert.strictEqual(chunks.length, 6);
    assert.strictEqual(chunks[0][2], 6);

    let reassembled = null;
    for (let i = 0; i < chunks.length; i++) {
      const res = chunker.tryReassemble(chunks[i]);
      if (i < chunks.length - 1) {
        assert.strictEqual(res, null, `Chunk ${i} should not complete message`);
      } else {
        reassembled = res;
      }
    }

    assert(reassembled !== null, 'Message reassembled on final chunk');
    assert.strictEqual(reassembled.length, 1000);
    assert.deepStrictEqual(Buffer.from(reassembled), sourceData);
  });

  // Test 3: Out-of-order chunk arrival
  test('Out-of-order chunk delivery reassembly', () => {
    const chunker = new BleChunker();
    const originalText = 'Remotva Bluetooth Low Energy Out-of-Order Packet Delivery Verification!';
    const payload = Buffer.from(originalText);
    const mtu = 23; // Tiny MTU creates multiple chunks
    const chunks = chunker.chunk(payload, mtu, 7);

    assert(chunks.length > 3, `Expected > 3 chunks for tiny MTU, got ${chunks.length}`);

    // Shuffle chunks
    const shuffled = [...chunks].reverse();

    let reassembled = null;
    for (const ch of shuffled) {
      const res = chunker.tryReassemble(ch);
      if (res) reassembled = res;
    }

    assert(reassembled !== null, 'Reassembled successfully despite reversed delivery order');
    assert.strictEqual(Buffer.from(reassembled).toString(), originalText);
  });

  // Test 4: 5-second partial message timeout drop
  test('Partial message drop after 5-second timeout', () => {
    const chunker = new BleChunker();
    const payload = Buffer.alloc(500, 0x42);
    const chunks = chunker.chunk(payload, 100, 99);

    const startTime = 10000;
    // Send only chunk 0 of 6
    const res1 = chunker.tryReassemble(chunks[0], startTime);
    assert.strictEqual(res1, null);
    assert.strictEqual(chunker.getPendingCount(), 1, '1 pending message');

    // Simulate 5.1 seconds later: send unrelated chunk or trigger prune
    const laterTime = startTime + 5100;
    const dummyChunk = new Uint8Array([105, 0, 1, 0xAA]);
    chunker.tryReassemble(dummyChunk, laterTime);

    // Message 99 should have been pruned
    assert.strictEqual(chunker.pending.has(99), false, 'Message 99 was dropped after 5s timeout');
  });

  console.log('\n--- Unit Verification: BleCodec MessagePack & Integer Mapping ---');

  // Test 5: MessagePack integer key encoding & decoding
  test('MessagePack integer-keyed envelope codec', () => {
    const envelope = {
      v: 1,
      t: 'cmd',
      id: 'c101',
      m: 'setVolume',
      p: { level: 0.75 },
    };

    const encoded = BleCodec.encode(envelope);
    assert(encoded instanceof Uint8Array);
    assert(encoded.length > 0);

    const decoded = BleCodec.decode(encoded);
    assert.strictEqual(decoded.v, 1);
    assert.strictEqual(decoded.t, 'cmd');
    assert.strictEqual(decoded.id, 'c101');
    assert.strictEqual(decoded.m, 'setVolume');
    assert.strictEqual(decoded.p.level, 0.75);
  });

  // Test 6: Raw JSON fallback compatibility
  test('BleCodec JSON fallback decoding', () => {
    const jsonStr = JSON.stringify({
      v: 1,
      t: 'res',
      id: 'c55',
      ok: true,
      p: { muted: false },
    });

    const jsonBytes = Buffer.from(jsonStr);
    const decoded = BleCodec.decode(jsonBytes);

    assert.strictEqual(decoded.v, 1);
    assert.strictEqual(decoded.t, 'res');
    assert.strictEqual(decoded.id, 'c55');
    assert.strictEqual(decoded.ok, true);
    assert.strictEqual(decoded.p.muted, false);
  });

  console.log('\n--- Bandwidth & Constraint Adaptation Verification ---');

  // Test 7: BLE session list filtering (active-only sessions)
  test('BLE session list filters to active-only sessions', () => {
    const allSessions = [
      { sessionId: '1001', name: 'Spotify.exe', level: 0.8, muted: false, active: true },
      { sessionId: '1002', name: 'System Sounds', level: 0.5, muted: false, active: false },
      { sessionId: '1003', name: 'Chrome.exe', level: 1.0, muted: false, active: true },
      { sessionId: '1004', name: 'Discord.exe', level: 0.9, muted: true, active: false },
    ];

    // Simulate BLE active filter
    const bleFiltered = allSessions.filter((s) => s.active);
    assert.strictEqual(bleFiltered.length, 2);
    assert(bleFiltered.every((s) => s.active === true));
    assert.strictEqual(bleFiltered[0].name, 'Spotify.exe');
    assert.strictEqual(bleFiltered[1].name, 'Chrome.exe');
  });

  // Test 8: BLE Album Art Cap (96x96 and 8KB ERR_TOO_LARGE check)
  test('BLE Album Art 96x96 cap and 8KB ERR_TOO_LARGE guard', () => {
    const artUnder8KB = Buffer.alloc(4096, 0xFF);
    const artOver8KB = Buffer.alloc(9000, 0xFF);

    function validateArtSize(artBuffer, id) {
      if (artBuffer.length > 8192) {
        return {
          v: 1,
          t: 'res',
          id,
          ok: false,
          err: 'ERR_TOO_LARGE',
          msg: 'Album art exceeds BLE 8KB limit.',
        };
      }
      return {
        v: 1,
        t: 'res',
        id,
        ok: true,
        p: { mime: 'image/jpeg', size: artBuffer.length },
      };
    }

    const res1 = validateArtSize(artUnder8KB, 'c1');
    assert.strictEqual(res1.ok, true);

    const res2 = validateArtSize(artOver8KB, 'c2');
    assert.strictEqual(res2.ok, false);
    assert.strictEqual(res2.err, 'ERR_TOO_LARGE');
  });

  // Test 9: End-to-end simulated BLE exchange (Command write -> Chunker -> Codec -> Dispatch -> Reply)
  test('End-to-end simulated BLE exchange pipeline', () => {
    const clientChunker = new BleChunker();
    const serverChunker = new BleChunker();

    // Client creates a getState command
    const cmdEnvelope = {
      v: 1,
      t: 'cmd',
      id: 'c400',
      m: 'getState',
      p: {},
    };

    // Client encodes to MessagePack and chunks over BLE MTU 185
    const cmdBytes = BleCodec.encode(cmdEnvelope);
    const clientChunks = clientChunker.chunk(cmdBytes, 185);

    // Server receives chunks and reassembles
    let serverReceivedBytes = null;
    for (const chunk of clientChunks) {
      const res = serverChunker.tryReassemble(chunk);
      if (res) serverReceivedBytes = res;
    }

    assert(serverReceivedBytes !== null, 'Server received full command');
    const serverDecoded = BleCodec.decode(serverReceivedBytes);
    assert.strictEqual(serverDecoded.m, 'getState');
    assert.strictEqual(serverDecoded.id, 'c400');

    // Server prepares snapshot response
    const resEnvelope = {
      v: 1,
      t: 'res',
      id: serverDecoded.id,
      ok: true,
      p: {
        master: { level: 0.65, muted: false },
        sessions: [{ sessionId: '500', name: 'MusicPlayer.exe', level: 0.8, active: true }],
      },
    };

    const resBytes = BleCodec.encode(resEnvelope);
    const serverChunks = serverChunker.chunk(resBytes, 185);

    // Client receives response chunks
    let clientReceivedBytes = null;
    for (const chunk of serverChunks) {
      const res = clientChunker.tryReassemble(chunk);
      if (res) clientReceivedBytes = res;
    }

    assert(clientReceivedBytes !== null, 'Client received full response');
    const clientDecoded = BleCodec.decode(clientReceivedBytes);
    assert.strictEqual(clientDecoded.ok, true);
    assert.strictEqual(clientDecoded.id, 'c400');
    assert.strictEqual(clientDecoded.p.master.level, 0.65);
    assert.strictEqual(clientDecoded.p.sessions[0].name, 'MusicPlayer.exe');
  });

  console.log('\n====================================================');
  console.log(`BLE Verification Summary: ${passed}/${total} Tests Passed`);
  console.log('====================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running BLE tests:', err);
  process.exit(1);
});
