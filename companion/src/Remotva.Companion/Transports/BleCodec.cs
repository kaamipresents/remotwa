using System;
using System.Collections.Generic;
using System.Text;
using System.Text.Json;
using MessagePack;
using Remotva.Companion.Protocol;

namespace Remotva.Companion.Transports;

/// <summary>
/// Implements BLE serialization for Remotva protocol envelopes.
/// Maps protocol keys to integers in MessagePack format for compact wire transmission:
/// 0: v (version, int)
/// 1: t (type: cmd/res/evt, string)
/// 2: id (string)
/// 3: m (method, string)
/// 4: ok (bool)
/// 5: p (payload: dynamic object or JsonElement)
/// 6: code (string, error code)
/// 7: message (string, error message)
/// Dual-mode: gracefully falls back to UTF-8 JSON if payload starts with '{' (0x7B).
/// </summary>
public static class BleCodec
{
    public const int KeyVersion = 0;
    public const int KeyType = 1;
    public const int KeyId = 2;
    public const int KeyMethod = 3;
    public const int KeyOk = 4;
    public const int KeyPayload = 5;
    public const int KeyCode = 6;
    public const int KeyMessage = 7;

    public static byte[] Encode(ProtocolEnvelope envelope)
    {
        var map = new Dictionary<int, object?>();
        map[KeyVersion] = envelope.Version;
        map[KeyType] = envelope.Type;

        if (envelope.Id != null) map[KeyId] = envelope.Id;
        if (envelope.Method != null) map[KeyMethod] = envelope.Method;
        if (envelope.Ok.HasValue) map[KeyOk] = envelope.Ok.Value;
        if (envelope.ErrorCode != null) map[KeyCode] = envelope.ErrorCode;
        if (envelope.ErrorMessage != null) map[KeyMessage] = envelope.ErrorMessage;

        if (envelope.Payload.HasValue)
        {
            // Serialize JsonElement payload to a JSON string or object graph
            try
            {
                string json = envelope.Payload.Value.GetRawText();
                var parsed = JsonSerializer.Deserialize<object>(json);
                map[KeyPayload] = parsed;
            }
            catch
            {
                map[KeyPayload] = envelope.Payload.Value.ToString();
            }
        }

        return MessagePackSerializer.Serialize(map);
    }

    public static ProtocolEnvelope? Decode(byte[] bytes)
    {
        if (bytes == null || bytes.Length == 0) return null;

        // Check if raw JSON
        if (bytes[0] == (byte)'{')
        {
            string json = Encoding.UTF8.GetString(bytes);
            return ProtocolEnvelope.FromJson(json);
        }

        try
        {
            // Deserialize integer-keyed map from MessagePack
            var map = MessagePackSerializer.Deserialize<Dictionary<int, object?>>(bytes);
            if (map == null) return null;

            int version = 1;
            if (map.TryGetValue(KeyVersion, out var vObj) && vObj != null)
            {
                version = Convert.ToInt32(vObj);
            }

            string type = "cmd";
            if (map.TryGetValue(KeyType, out var tObj) && tObj != null)
            {
                type = tObj.ToString() ?? "cmd";
            }

            string? id = null;
            if (map.TryGetValue(KeyId, out var idObj) && idObj != null)
            {
                id = idObj.ToString();
            }

            string? method = null;
            if (map.TryGetValue(KeyMethod, out var mObj) && mObj != null)
            {
                method = mObj.ToString();
            }

            bool? ok = null;
            if (map.TryGetValue(KeyOk, out var okObj) && okObj != null)
            {
                ok = Convert.ToBoolean(okObj);
            }

            string? code = null;
            if (map.TryGetValue(KeyCode, out var codeObj) && codeObj != null)
            {
                code = codeObj.ToString();
            }

            string? message = null;
            if (map.TryGetValue(KeyMessage, out var msgObj) && msgObj != null)
            {
                message = msgObj.ToString();
            }

            JsonElement? payload = null;
            if (map.TryGetValue(KeyPayload, out var pObj) && pObj != null)
            {
                string pJson = JsonSerializer.Serialize(pObj);
                using var doc = JsonDocument.Parse(pJson);
                payload = doc.RootElement.Clone();
            }

            return new ProtocolEnvelope
            {
                Version = version,
                Type = type,
                Id = id,
                Method = method,
                Ok = ok,
                ErrorCode = code,
                ErrorMessage = message,
                Payload = payload
            };
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[BleCodec] Failed to decode MessagePack payload: {ex.Message}");
            return null;
        }
    }
}
