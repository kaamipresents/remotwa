/**
 * BleChunker.ts
 * Implements 3-byte chunking protocol for BLE GATT:
 * Header: [messageId (byte), chunkIndex (byte), chunkCount (byte)]
 * Payload: slice up to (MTU - 3) bytes.
 * Reassembly with 5-second timeout drop.
 */

interface PendingMessage {
  chunkCount: number;
  lastUpdated: number;
  chunks: Map<number, Uint8Array>;
}

export class BleChunker {
  private pending: Map<number, PendingMessage> = new Map();
  private nextMessageId: number = 0;
  private readonly timeoutMs = 5000;

  public getNextMessageId(): number {
    const id = this.nextMessageId;
    this.nextMessageId = (this.nextMessageId + 1) % 256;
    return id;
  }

  /**
   * Chunks a payload into slices of size up to (mtu - 3).
   */
  public chunk(payload: Uint8Array, mtu: number, messageId?: number): Uint8Array[] {
    const msgId = messageId !== undefined ? messageId : this.getNextMessageId();
    const maxPayload = Math.max(1, mtu - 3);

    if (payload.length === 0) {
      return [new Uint8Array([msgId, 0, 1])];
    }

    const chunkCount = Math.ceil(payload.length / maxPayload);
    if (chunkCount > 255) {
      throw new Error(`Payload too large for BLE chunking: ${chunkCount} chunks needed (max 255)`);
    }

    const chunks: Uint8Array[] = [];

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

  /**
   * Attempts to reassemble an incoming chunk. Returns Uint8Array if complete, null otherwise.
   */
  public tryReassemble(chunk: Uint8Array): Uint8Array | null {
    this.pruneTimedOut();

    if (!chunk || chunk.length < 3) {
      return null;
    }

    const messageId = chunk[0];
    const chunkIndex = chunk[1];
    const chunkCount = chunk[2];

    if (chunkCount === 0 || chunkIndex >= chunkCount) {
      return null;
    }

    const payloadSlice = chunk.subarray(3);

    let pending = this.pending.get(messageId);
    if (!pending) {
      pending = {
        chunkCount,
        lastUpdated: Date.now(),
        chunks: new Map(),
      };
      this.pending.set(messageId, pending);
    }

    pending.lastUpdated = Date.now();
    pending.chunks.set(chunkIndex, payloadSlice);

    if (pending.chunks.size === pending.chunkCount) {
      // All chunks present, assemble
      let totalLength = 0;
      for (let i = 0; i < pending.chunkCount; i++) {
        const slice = pending.chunks.get(i);
        if (!slice) return null;
        totalLength += slice.length;
      }

      const fullMessage = new Uint8Array(totalLength);
      let writeOffset = 0;
      for (let i = 0; i < pending.chunkCount; i++) {
        const slice = pending.chunks.get(i)!;
        fullMessage.set(slice, writeOffset);
        writeOffset += slice.length;
      }

      this.pending.delete(messageId);
      return fullMessage;
    }

    return null;
  }

  private pruneTimedOut(): void {
    const now = Date.now();
    for (const [id, item] of this.pending.entries()) {
      if (now - item.lastUpdated > this.timeoutMs) {
        this.pending.delete(id);
      }
    }
  }

  public reset(): void {
    this.pending.clear();
  }
}
