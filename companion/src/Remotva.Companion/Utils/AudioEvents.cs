namespace Remotva.Companion.Utils;

public enum AudioEventType
{
    VolumeChanged,
    SessionsChanged,
    SessionVolumeChanged,
    TrackChanged,
    PlayStateChanged,
    ServerShutdown
}

public class AudioEvent
{
    public AudioEventType Type { get; set; }
    public object? Data { get; set; }

    public static AudioEvent VolumeChanged(float level, bool muted) =>
        new() { Type = AudioEventType.VolumeChanged, Data = new { level, muted } };

    public static AudioEvent SessionsChanged(object sessions) =>
        new() { Type = AudioEventType.SessionsChanged, Data = new { sessions } };

    public static AudioEvent SessionVolumeChanged(string sessionId, float level, bool muted) =>
        new() { Type = AudioEventType.SessionVolumeChanged, Data = new { sessionId, level, muted } };

    public static AudioEvent TrackChanged(object trackInfo) =>
        new() { Type = AudioEventType.TrackChanged, Data = trackInfo };

    public static AudioEvent PlayStateChanged(string playState, long position) =>
        new() { Type = AudioEventType.PlayStateChanged, Data = new { playState, position } };

    public static AudioEvent ServerShutdown(string reason) =>
        new() { Type = AudioEventType.ServerShutdown, Data = new { reason } };
}
