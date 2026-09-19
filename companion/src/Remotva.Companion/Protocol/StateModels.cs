using System.Text.Json.Serialization;

namespace Remotva.Companion.Protocol;

public class MasterVolumeState
{
    [JsonPropertyName("level")]
    public float Level { get; set; }

    [JsonPropertyName("muted")]
    public bool Muted { get; set; }
}

public class TrackMetadata
{
    [JsonPropertyName("trackId")]
    public string TrackId { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("artist")]
    public string Artist { get; set; } = string.Empty;

    [JsonPropertyName("album")]
    public string Album { get; set; } = string.Empty;

    [JsonPropertyName("hasArt")]
    public bool HasArt { get; set; }

    [JsonPropertyName("duration")]
    public long Duration { get; set; } // in milliseconds

    [JsonPropertyName("position")]
    public long Position { get; set; } // in milliseconds

    [JsonPropertyName("playState")]
    public string PlayState { get; set; } = "stopped"; // "playing", "paused", "stopped"
}

public class AudioSessionInfo
{
    [JsonPropertyName("sessionId")]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("level")]
    public float Level { get; set; }

    [JsonPropertyName("muted")]
    public bool Muted { get; set; }

    [JsonPropertyName("active")]
    public bool Active { get; set; }
}

public class SystemStateSnapshot
{
    [JsonPropertyName("master")]
    public MasterVolumeState Master { get; set; } = new();

    [JsonPropertyName("track")]
    public TrackMetadata? Track { get; set; }

    [JsonPropertyName("sessions")]
    public List<AudioSessionInfo> Sessions { get; set; } = new();
}

public class HelloResponse
{
    [JsonPropertyName("serverName")]
    public string ServerName { get; set; } = Environment.MachineName;

    [JsonPropertyName("deviceId")]
    public string DeviceId { get; set; } = string.Empty;

    [JsonPropertyName("v")]
    public int Version { get; set; } = 1;

    [JsonPropertyName("capabilities")]
    public List<string> Capabilities { get; set; } = new() { "wifi", "ble" };
}

public class PairResponse
{
    [JsonPropertyName("token")]
    public string Token { get; set; } = string.Empty;

    [JsonPropertyName("deviceId")]
    public string DeviceId { get; set; } = string.Empty;
}
