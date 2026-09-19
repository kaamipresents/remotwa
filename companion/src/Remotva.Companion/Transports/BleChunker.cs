using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;

namespace Remotva.Companion.Transports;

/// <summary>
/// Implements the 3-byte chunking protocol for BLE GATT transport:
/// Header: [messageId (byte), chunkIndex (byte), chunkCount (byte)]
/// Payload: chunk slice up to (MTU - 3) bytes.
/// Drops partial messages after a 5-second timeout.
/// </summary>
public class BleChunker
{
    private class PendingMessage
    {
        public byte ChunkCount { get; }
        public DateTime LastUpdatedUtc { get; set; }
        public Dictionary<byte, byte[]> Chunks { get; } = new();

        public PendingMessage(byte chunkCount)
        {
            ChunkCount = chunkCount;
            LastUpdatedUtc = DateTime.UtcNow;
        }
    }

    private readonly ConcurrentDictionary<byte, PendingMessage> _pending = new();
    private static readonly TimeSpan TimeoutDuration = TimeSpan.FromSeconds(5);
    private byte _nextMessageId = 0;
    private readonly object _idLock = new();

    public byte GetNextMessageId()
    {
        lock (_idLock)
        {
            return _nextMessageId++;
        }
    }

    /// <summary>
    /// Slices a full message payload into chunks according to the negotiated MTU.
    /// </summary>
    public List<byte[]> Chunk(byte[] messagePayload, int mtu, byte? messageId = null)
    {
        ArgumentNullException.ThrowIfNull(messagePayload);

        byte msgId = messageId ?? GetNextMessageId();
        int maxPayloadPerChunk = Math.Max(1, mtu - 3);

        if (messagePayload.Length == 0)
        {
            return new List<byte[]>
            {
                new byte[] { msgId, 0, 1 }
            };
        }

        int chunkCountInt = (messagePayload.Length + maxPayloadPerChunk - 1) / maxPayloadPerChunk;
        if (chunkCountInt > 255)
        {
            throw new ArgumentException($"Message too large for BLE chunking: requires {chunkCountInt} chunks (max 255).");
        }

        byte chunkCount = (byte)chunkCountInt;
        var result = new List<byte[]>(chunkCount);

        for (byte i = 0; i < chunkCount; i++)
        {
            int offset = i * maxPayloadPerChunk;
            int length = Math.Min(maxPayloadPerChunk, messagePayload.Length - offset);

            byte[] chunk = new byte[3 + length];
            chunk[0] = msgId;
            chunk[1] = i;
            chunk[2] = chunkCount;

            Buffer.BlockCopy(messagePayload, offset, chunk, 3, length);
            result.Add(chunk);
        }

        return result;
    }

    /// <summary>
    /// Processes an incoming raw chunk. If the chunk completes a message, returns true and the reassembled byte array.
    /// Incomplete messages older than 5 seconds are pruned automatically.
    /// </summary>
    public bool TryReassemble(byte[] rawChunk, out byte[]? completedPayload)
    {
        completedPayload = null;
        PruneTimedOutMessages();

        if (rawChunk == null || rawChunk.Length < 3)
        {
            return false;
        }

        byte messageId = rawChunk[0];
        byte chunkIndex = rawChunk[1];
        byte chunkCount = rawChunk[2];

        if (chunkCount == 0 || chunkIndex >= chunkCount)
        {
            return false;
        }

        int payloadLen = rawChunk.Length - 3;
        byte[] chunkPayload = new byte[payloadLen];
        if (payloadLen > 0)
        {
            Buffer.BlockCopy(rawChunk, 3, chunkPayload, 0, payloadLen);
        }

        var pending = _pending.GetOrAdd(messageId, _ => new PendingMessage(chunkCount));

        lock (pending)
        {
            pending.LastUpdatedUtc = DateTime.UtcNow;
            pending.Chunks[chunkIndex] = chunkPayload;

            if (pending.Chunks.Count == pending.ChunkCount)
            {
                // All chunks received; reassemble
                int totalLength = 0;
                for (byte i = 0; i < pending.ChunkCount; i++)
                {
                    if (!pending.Chunks.TryGetValue(i, out var slice))
                    {
                        return false;
                    }
                    totalLength += slice.Length;
                }

                var full = new byte[totalLength];
                int writeOffset = 0;
                for (byte i = 0; i < pending.ChunkCount; i++)
                {
                    var slice = pending.Chunks[i];
                    Buffer.BlockCopy(slice, 0, full, writeOffset, slice.Length);
                    writeOffset += slice.Length;
                }

                _pending.TryRemove(messageId, out _);
                completedPayload = full;
                return true;
            }
        }

        return false;
    }

    private void PruneTimedOutMessages()
    {
        var now = DateTime.UtcNow;
        foreach (var kvp in _pending)
        {
            if (now - kvp.Value.LastUpdatedUtc > TimeoutDuration)
            {
                _pending.TryRemove(kvp.Key, out _);
            }
        }
    }

    public void Reset()
    {
        _pending.Clear();
    }
}
