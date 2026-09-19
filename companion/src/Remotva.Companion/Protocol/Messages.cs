using System.Text.Json;
using System.Text.Json.Serialization;

namespace Remotva.Companion.Protocol;

/// <summary>
/// Root protocol envelope as defined in windows-audio-remote-spec.md:
/// cmd: { "v": 1, "t": "cmd", "id": "c17", "m": "setVolume", "p": { "level": 0.42 } }
/// res: { "v": 1, "t": "res", "id": "c17", "ok": true, "p": { "level": 0.42 } }
/// evt: { "v": 1, "t": "evt", "m": "volumeChanged", "p": { "level": 0.42, "muted": false } }
/// </summary>
public class ProtocolEnvelope
{
    [JsonPropertyName("v")]
    public int Version { get; set; } = 1;

    [JsonPropertyName("t")]
    public string Type { get; set; } = string.Empty; // "cmd", "res", "evt"

    [JsonPropertyName("id")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Id { get; set; }

    [JsonPropertyName("m")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Method { get; set; }

    [JsonPropertyName("ok")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? Ok { get; set; }

    [JsonPropertyName("err")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ErrorCode { get; set; }

    [JsonPropertyName("msg")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ErrorMessage { get; set; }

    [JsonPropertyName("p")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public JsonElement? Payload { get; set; }

    public static ProtocolEnvelope CreateResponse(string id, object? payload)
    {
        return new ProtocolEnvelope
        {
            Version = 1,
            Type = "res",
            Id = id,
            Ok = true,
            Payload = payload != null ? JsonSerializer.SerializeToElement(payload) : null
        };
    }

    public static ProtocolEnvelope CreateError(string id, string code, string message)
    {
        return new ProtocolEnvelope
        {
            Version = 1,
            Type = "res",
            Id = id,
            Ok = false,
            ErrorCode = code,
            ErrorMessage = message
        };
    }

    public static ProtocolEnvelope CreateEvent(string eventName, object? payload)
    {
        return new ProtocolEnvelope
        {
            Version = 1,
            Type = "evt",
            Method = eventName,
            Payload = payload != null ? JsonSerializer.SerializeToElement(payload) : null
        };
    }

    public static ProtocolEnvelope? FromJson(string json)
    {
        return JsonSerializer.Deserialize<ProtocolEnvelope>(json);
    }

    public string ToJson()
    {
        return JsonSerializer.Serialize(this);
    }
}


public static class ErrorCodes
{
    public const string ErrAuth = "ERR_AUTH";
    public const string ErrUnknownCmd = "ERR_UNKNOWN_CMD";
    public const string ErrBadPayload = "ERR_BAD_PAYLOAD";
    public const string ErrNoSession = "ERR_NO_SESSION";
    public const string ErrNoMedia = "ERR_NO_MEDIA";
    public const string ErrTooLarge = "ERR_TOO_LARGE";
    public const string ErrInternal = "ERR_INTERNAL";
}
