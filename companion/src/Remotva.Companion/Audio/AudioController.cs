using System;
using NAudio.CoreAudioApi;
using Remotva.Companion.Protocol;
using Remotva.Companion.Utils;

namespace Remotva.Companion.Audio;

public class AudioController : IDisposable
{
    private readonly MMDeviceEnumerator _deviceEnumerator;
    private MMDevice? _defaultPlaybackDevice;
    private AudioEndpointVolume? _endpointVolume;
    private readonly Action<AudioEvent> _eventDispatcher;
    private readonly object _lock = new();
    private bool _disposed;

    public AudioController(Action<AudioEvent> eventDispatcher)
    {
        _eventDispatcher = eventDispatcher ?? throw new ArgumentNullException(nameof(eventDispatcher));
        _deviceEnumerator = new MMDeviceEnumerator();
        InitializeDevice();
    }

    private void InitializeDevice()
    {
        lock (_lock)
        {
            try
            {
                if (_endpointVolume != null)
                {
                    _endpointVolume.OnVolumeNotification -= EndpointVolume_OnVolumeNotification;
                    _endpointVolume.Dispose();
                    _endpointVolume = null;
                }

                _defaultPlaybackDevice?.Dispose();
                _defaultPlaybackDevice = null;

                _defaultPlaybackDevice = _deviceEnumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
                if (_defaultPlaybackDevice != null)
                {
                    _endpointVolume = _defaultPlaybackDevice.AudioEndpointVolume;
                    _endpointVolume.OnVolumeNotification += EndpointVolume_OnVolumeNotification;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[AudioController] Error initializing default audio device: {ex.Message}");
            }
        }
    }

    private void EndpointVolume_OnVolumeNotification(AudioVolumeNotificationData data)
    {
        // COM callback marshaled to serialized channel
        _eventDispatcher(AudioEvent.VolumeChanged(data.MasterVolume, data.Muted));
    }

    public MasterVolumeState GetMasterVolume()
    {
        lock (_lock)
        {
            EnsureDevice();
            if (_endpointVolume == null)
            {
                return new MasterVolumeState { Level = 0.0f, Muted = false };
            }

            return new MasterVolumeState
            {
                Level = _endpointVolume.MasterVolumeLevelScalar,
                Muted = _endpointVolume.Mute
            };
        }
    }

    public float SetMasterVolume(float level)
    {
        level = Math.Clamp(level, 0.0f, 1.0f);
        lock (_lock)
        {
            EnsureDevice();
            if (_endpointVolume != null)
            {
                _endpointVolume.MasterVolumeLevelScalar = level;
            }
        }
        return level;
    }

    public bool SetMute(bool muted)
    {
        lock (_lock)
        {
            EnsureDevice();
            if (_endpointVolume != null)
            {
                _endpointVolume.Mute = muted;
            }
        }
        return muted;
    }

    public float AdjustVolume(float delta)
    {
        lock (_lock)
        {
            EnsureDevice();
            if (_endpointVolume != null)
            {
                float current = _endpointVolume.MasterVolumeLevelScalar;
                float target = Math.Clamp(current + delta, 0.0f, 1.0f);
                _endpointVolume.MasterVolumeLevelScalar = target;
                return target;
            }
        }
        return 0.0f;
    }

    private void EnsureDevice()
    {
        if (_endpointVolume == null || _defaultPlaybackDevice == null)
        {
            InitializeDevice();
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        lock (_lock)
        {
            if (_endpointVolume != null)
            {
                _endpointVolume.OnVolumeNotification -= EndpointVolume_OnVolumeNotification;
                _endpointVolume.Dispose();
                _endpointVolume = null;
            }

            _defaultPlaybackDevice?.Dispose();
            _defaultPlaybackDevice = null;
            _deviceEnumerator.Dispose();
        }
    }
}
