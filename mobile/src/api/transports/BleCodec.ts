/**
 * BleCodec.ts
 * MessagePack serialization adapter with integer keys matching companion BleCodec.cs:
 * 0: v
 * 1: t
 * 2: id
 * 3: m
 * 4: ok
 * 5: p
 * 6: err / code
 * 7: msg / message
 */

import { encode, decode } from '@msgpack/msgpack';
import { ProtocolEnvelope } from '../protocol';

export const BLE_KEY_VERSION = 0;
export const BLE_KEY_TYPE = 1;
export const BLE_KEY_ID = 2;
export const BLE_KEY_METHOD = 3;
export const BLE_KEY_OK = 4;
export const BLE_KEY_PAYLOAD = 5;
export const BLE_KEY_CODE = 6;
export const BLE_KEY_MESSAGE = 7;

export class BleCodec {
  public static encode(envelope: ProtocolEnvelope): Uint8Array {
    const map: Record<number, any> = {};
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

  public static decode(bytes: Uint8Array): ProtocolEnvelope | null {
    if (!bytes || bytes.length === 0) return null;

    // Check if raw JSON (starts with '{' which is 0x7B = 123)
    if (bytes[0] === 123) {
      try {
        const text = new TextDecoder('utf-8').decode(bytes);
        return JSON.parse(text) as ProtocolEnvelope;
      } catch {
        return null;
      }
    }

    try {
      const obj = decode(bytes) as any;
      if (!obj) return null;

      const getVal = (key: number) => {
        if (obj instanceof Map) return obj.get(key) ?? obj.get(String(key));
        return obj[key] ?? obj[String(key)];
      };

      const envelope: ProtocolEnvelope = {
        v: getVal(BLE_KEY_VERSION) ?? 1,
        t: getVal(BLE_KEY_TYPE) ?? 'res',
      };

      const id = getVal(BLE_KEY_ID);
      if (id !== undefined) envelope.id = String(id);

      const m = getVal(BLE_KEY_METHOD);
      if (m !== undefined) envelope.m = String(m);

      const ok = getVal(BLE_KEY_OK);
      if (ok !== undefined) envelope.ok = Boolean(ok);

      const code = getVal(BLE_KEY_CODE);
      if (code !== undefined) envelope.err = String(code);

      const message = getVal(BLE_KEY_MESSAGE);
      if (message !== undefined) envelope.msg = String(message);

      const p = getVal(BLE_KEY_PAYLOAD);
      if (p !== undefined) envelope.p = p;

      return envelope;
    } catch (ex) {
      console.warn('[BleCodec] Failed to decode MessagePack payload:', ex);
      return null;
    }
  }
}
