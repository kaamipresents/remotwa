using System;
using System.Threading.Tasks;
using Windows.Media.Control;
using Remotva.Companion.Protocol;
using Remotva.Companion.Utils;

namespace Remotva.Companion.Media;

public class MediaController : IDisposable
{
    private GlobalSystemMediaTransportControlsSessionManager? _sessionManager;
    private GlobalSystemMediaTransportControlsSession? _currentSession;
    private readonly AlbumArtCache _artCache = new();
    private readonly Action<AudioEvent> _eventDispatcher;
    private readonly object _lock = new();
    private TrackMetadata? _cachedTrack;
    private bool _disposed;

    public MediaController(Action<AudioEvent> eventDispatcher)
    {
        _eventDispatcher = eventDispatcher ?? throw new ArgumentNullException(nameof(eventDispatcher));
    }

    public async Task InitializeAsync()
    {
        try
        {
            _sessionManager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            if (_sessionManager != null)
            {
                _sessionManager.CurrentSessionChanged += SessionManager_CurrentSessionChanged;
                UpdateCurrentSession(_sessionManager.GetCurrentSession());
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[MediaController] Error initializing GSMTC: {ex.Message}");
        }
    }

    private void SessionManager_CurrentSessionChanged(GlobalSystemMediaTransportControlsSessionManager sender, CurrentSessionChangedEventArgs args)
    {
        UpdateCurrentSession(sender.GetCurrentSession());
    }

    private void UpdateCurrentSession(GlobalSystemMediaTransportControlsSession? session)
    {
        lock (_lock)
        {
            if (_currentSession != null)
            {
                _currentSession.MediaPropertiesChanged -= CurrentSession_MediaPropertiesChanged;
                _currentSession.PlaybackInfoChanged -= CurrentSession_PlaybackInfoChanged;
                _currentSession.TimelinePropertiesChanged -= CurrentSession_TimelinePropertiesChanged;
            }

            _currentSession = session;

            if (_currentSession != null)
            {
                _currentSession.MediaPropertiesChanged += CurrentSession_MediaPropertiesChanged;
                _currentSession.PlaybackInfoChanged += CurrentSession_PlaybackInfoChanged;
                _currentSession.TimelinePropertiesChanged += CurrentSession_TimelinePropertiesChanged;
            }
        }

        _ = RefreshMediaInfoAsync();
    }

    private void CurrentSession_MediaPropertiesChanged(GlobalSystemMediaTransportControlsSession sender, MediaPropertiesChangedEventArgs args)
    {
        _ = RefreshMediaInfoAsync();
    }

    private void CurrentSession_PlaybackInfoChanged(GlobalSystemMediaTransportControlsSession sender, PlaybackInfoChangedEventArgs args)
    {
        _ = RefreshPlaybackInfoAsync(sender);
    }

    private void CurrentSession_TimelinePropertiesChanged(GlobalSystemMediaTransportControlsSession sender, TimelinePropertiesChangedEventArgs args)
    {
        _ = RefreshTimelineAsync(sender);
    }

    public async Task RefreshMediaInfoAsync()
    {
        GlobalSystemMediaTransportControlsSession? session;
        lock (_lock)
        {
            session = _currentSession;
        }

        if (session == null)
        {
            _cachedTrack = null;
            _eventDispatcher(AudioEvent.TrackChanged(new { trackId = string.Empty, title = string.Empty, artist = string.Empty, album = string.Empty, hasArt = false, duration = 0 }));
            return;
        }

        try
        {
            var mediaProps = await session.TryGetMediaPropertiesAsync();
            var playbackInfo = session.GetPlaybackInfo();
            var timeline = session.GetTimelineProperties();

            string title = mediaProps?.Title ?? string.Empty;
            string artist = mediaProps?.Artist ?? string.Empty;
            string album = mediaProps?.AlbumTitle ?? string.Empty;
            string trackId = AlbumArtCache.ComputeTrackId(title, artist);
            bool hasArt = mediaProps?.Thumbnail != null;

            if (hasArt && mediaProps?.Thumbnail != null)
            {
                _ = _artCache.ProcessAndCacheArtAsync(trackId, mediaProps.Thumbnail);
            }

            string playState = MapPlayState(playbackInfo?.PlaybackStatus);
            long durationMs = (long)(timeline?.EndTime.TotalMilliseconds ?? 0);
            long positionMs = (long)(timeline?.Position.TotalMilliseconds ?? 0);

            var track = new TrackMetadata
            {
                TrackId = trackId,
                Title = title,
                Artist = artist,
                Album = album,
                HasArt = hasArt,
                Duration = durationMs,
                Position = positionMs,
                PlayState = playState
            };

            _cachedTrack = track;

            _eventDispatcher(AudioEvent.TrackChanged(new
            {
                trackId = track.TrackId,
                title = track.Title,
                artist = track.Artist,
                album = track.Album,
                hasArt = track.HasArt,
                duration = track.Duration
            }));
            _eventDispatcher(AudioEvent.PlayStateChanged(track.PlayState, track.Position));
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[MediaController] Error refreshing media info: {ex.Message}");
        }
    }

    private Task RefreshPlaybackInfoAsync(GlobalSystemMediaTransportControlsSession session)
    {
        try
        {
            var playbackInfo = session.GetPlaybackInfo();
            var timeline = session.GetTimelineProperties();
            string playState = MapPlayState(playbackInfo?.PlaybackStatus);
            long position = (long)(timeline?.Position.TotalMilliseconds ?? 0);

            if (_cachedTrack != null)
            {
                _cachedTrack.PlayState = playState;
                _cachedTrack.Position = position;
            }

            _eventDispatcher(AudioEvent.PlayStateChanged(playState, position));
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[MediaController] Error refreshing playback info: {ex.Message}");
        }
        return Task.CompletedTask;
    }

    private Task RefreshTimelineAsync(GlobalSystemMediaTransportControlsSession session)
    {
        try
        {
            var timeline = session.GetTimelineProperties();
            long position = (long)(timeline?.Position.TotalMilliseconds ?? 0);
            if (_cachedTrack != null)
            {
                _cachedTrack.Position = position;
            }
        }
        catch { }
        return Task.CompletedTask;
    }

    public TrackMetadata? GetCurrentTrack() => _cachedTrack;

    public byte[]? GetAlbumArt(string trackId, int maxSize = 300) => _artCache.GetCachedArt(trackId, maxSize);

    public async Task<string> ExecuteTransportAsync(string action)
    {
        GlobalSystemMediaTransportControlsSession? session;
        lock (_lock)
        {
            session = _currentSession;
        }

        if (session == null)
        {
            throw new InvalidOperationException("ERR_NO_MEDIA");
        }

        bool success = action.ToLowerInvariant() switch
        {
            "play" => await session.TryPlayAsync(),
            "pause" => await session.TryPauseAsync(),
            "toggle" => await session.TryTogglePlayPauseAsync(),
            "next" => await session.TrySkipNextAsync(),
            "previous" => await session.TrySkipPreviousAsync(),
            _ => throw new ArgumentException($"Invalid action: {action}")
        };

        if (!success)
        {
            throw new InvalidOperationException("ERR_INTERNAL");
        }

        var playbackInfo = session.GetPlaybackInfo();
        return MapPlayState(playbackInfo?.PlaybackStatus);
    }

    private static string MapPlayState(GlobalSystemMediaTransportControlsSessionPlaybackStatus? status)
    {
        return status switch
        {
            GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing => "playing",
            GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused => "paused",
            GlobalSystemMediaTransportControlsSessionPlaybackStatus.Stopped => "stopped",
            _ => "stopped"
        };
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        lock (_lock)
        {
            if (_currentSession != null)
            {
                _currentSession.MediaPropertiesChanged -= CurrentSession_MediaPropertiesChanged;
                _currentSession.PlaybackInfoChanged -= CurrentSession_PlaybackInfoChanged;
                _currentSession.TimelinePropertiesChanged -= CurrentSession_TimelinePropertiesChanged;
                _currentSession = null;
            }

            if (_sessionManager != null)
            {
                _sessionManager.CurrentSessionChanged -= SessionManager_CurrentSessionChanged;
                _sessionManager = null;
            }
        }
    }
}
