using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;
using Remotva.Companion.Protocol;
using Remotva.Companion.Utils;

namespace Remotva.Companion.Audio;

public class SessionManager : IDisposable
{
    private readonly MMDeviceEnumerator _deviceEnumerator;
    private MMDevice? _defaultPlaybackDevice;
    private AudioSessionManager? _sessionManager;
    private readonly Action<AudioEvent> _eventDispatcher;
    private readonly ConcurrentDictionary<uint, IAudioSessionEventsHandler> _registeredHandlers = new();
    private readonly object _lock = new();
    private bool _disposed;

    public SessionManager(Action<AudioEvent> eventDispatcher)
    {
        _eventDispatcher = eventDispatcher ?? throw new ArgumentNullException(nameof(eventDispatcher));
        _deviceEnumerator = new MMDeviceEnumerator();
        InitializeSessionManager();
    }

    private void InitializeSessionManager()
    {
        lock (_lock)
        {
            try
            {
                CleanupCurrentSessionManager();

                _defaultPlaybackDevice = _deviceEnumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
                if (_defaultPlaybackDevice != null)
                {
                    _sessionManager = _defaultPlaybackDevice.AudioSessionManager;
                    _sessionManager.OnSessionCreated += SessionManager_OnSessionCreated;
                    RegisterAllExistingSessions();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SessionManager] Error initializing session manager: {ex.Message}");
            }
        }
    }

    private void SessionManager_OnSessionCreated(object? sender, IAudioSessionControl newSession)
    {
        try
        {
            var control = new AudioSessionControl(newSession);
            RegisterSessionCallback(control);
        }
        catch { }
        _eventDispatcher(AudioEvent.SessionsChanged(GetSessions()));
    }

    private void RegisterAllExistingSessions()
    {
        if (_sessionManager == null) return;

        try
        {
            _sessionManager.RefreshSessions();
            var sessions = _sessionManager.Sessions;
            for (int i = 0; i < sessions.Count; i++)
            {
                RegisterSessionCallback(sessions[i]);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SessionManager] Error registering existing sessions: {ex.Message}");
        }
    }

    private void RegisterSessionCallback(AudioSessionControl session)
    {
        try
        {
            uint pid = session.GetProcessID;
            if (pid == 0 || _registeredHandlers.ContainsKey(pid)) return;

            var handler = new SessionEventHandler(
                pid,
                _eventDispatcher,
                () => _eventDispatcher(AudioEvent.SessionsChanged(GetSessions()))
            );

            session.RegisterEventClient(handler);
            _registeredHandlers[pid] = handler;
        }
        catch { }
    }

    public List<AudioSessionInfo> GetSessions()
    {
        lock (_lock)
        {
            var result = new List<AudioSessionInfo>();
            try
            {
                EnsureSessionManager();
                if (_sessionManager == null) return result;

                _sessionManager.RefreshSessions();
                var sessions = _sessionManager.Sessions;
                for (int i = 0; i < sessions.Count; i++)
                {
                    var session = sessions[i];
                    uint pid = session.GetProcessID;
                    if (pid == 0) continue; // Skip system sounds / idle session

                    // Ensure callback is registered
                    RegisterSessionCallback(session);

                    string name = GetProcessName(pid, session.DisplayName);
                    float volume = session.SimpleAudioVolume.Volume;
                    bool muted = session.SimpleAudioVolume.Mute;
                    bool active = session.State == AudioSessionState.AudioSessionStateActive;

                    result.Add(new AudioSessionInfo
                    {
                        SessionId = pid.ToString(),
                        Name = name,
                        Level = volume,
                        Muted = muted,
                        Active = active
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SessionManager] Error getting sessions: {ex.Message}");
            }
            return result;
        }
    }

    public float SetSessionVolume(string sessionId, float level)
    {
        level = Math.Clamp(level, 0.0f, 1.0f);
        if (!uint.TryParse(sessionId, out uint targetPid)) return level;

        lock (_lock)
        {
            EnsureSessionManager();
            if (_sessionManager == null) return level;

            _sessionManager.RefreshSessions();
            var sessions = _sessionManager.Sessions;
            for (int i = 0; i < sessions.Count; i++)
            {
                var session = sessions[i];
                if (session.GetProcessID == targetPid)
                {
                    session.SimpleAudioVolume.Volume = level;
                    _eventDispatcher(AudioEvent.SessionVolumeChanged(sessionId, level, session.SimpleAudioVolume.Mute));
                    break;
                }
            }
        }
        return level;
    }

    public bool SetSessionMute(string sessionId, bool muted)
    {
        if (!uint.TryParse(sessionId, out uint targetPid)) return muted;

        lock (_lock)
        {
            EnsureSessionManager();
            if (_sessionManager == null) return muted;

            _sessionManager.RefreshSessions();
            var sessions = _sessionManager.Sessions;
            for (int i = 0; i < sessions.Count; i++)
            {
                var session = sessions[i];
                if (session.GetProcessID == targetPid)
                {
                    session.SimpleAudioVolume.Mute = muted;
                    _eventDispatcher(AudioEvent.SessionVolumeChanged(sessionId, session.SimpleAudioVolume.Volume, muted));
                    break;
                }
            }
        }
        return muted;
    }

    private static string GetProcessName(uint pid, string displayName)
    {
        if (!string.IsNullOrWhiteSpace(displayName))
        {
            return displayName;
        }

        try
        {
            using var proc = Process.GetProcessById((int)pid);
            return proc.ProcessName;
        }
        catch
        {
            return $"App ({pid})";
        }
    }

    private void EnsureSessionManager()
    {
        if (_sessionManager == null || _defaultPlaybackDevice == null)
        {
            InitializeSessionManager();
        }
    }

    private void CleanupCurrentSessionManager()
    {
        _registeredHandlers.Clear();
        if (_sessionManager != null)
        {
            _sessionManager.OnSessionCreated -= SessionManager_OnSessionCreated;
            _sessionManager.Dispose();
            _sessionManager = null;
        }

        _defaultPlaybackDevice?.Dispose();
        _defaultPlaybackDevice = null;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        lock (_lock)
        {
            try
            {
                CleanupCurrentSessionManager();
                _deviceEnumerator.Dispose();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SessionManager] Error disposing: {ex.Message}");
            }
        }
    }

    private class SessionEventHandler : IAudioSessionEventsHandler
    {
        private readonly uint _pid;
        private readonly Action<AudioEvent> _dispatcher;
        private readonly Action _onSessionLifecycleChanged;

        public SessionEventHandler(uint pid, Action<AudioEvent> dispatcher, Action onSessionLifecycleChanged)
        {
            _pid = pid;
            _dispatcher = dispatcher;
            _onSessionLifecycleChanged = onSessionLifecycleChanged;
        }

        public void OnVolumeChanged(float volume, bool isMuted)
        {
            _dispatcher(AudioEvent.SessionVolumeChanged(_pid.ToString(), volume, isMuted));
        }

        public void OnStateChanged(AudioSessionState state)
        {
            _onSessionLifecycleChanged();
        }

        public void OnSessionDisconnected(AudioSessionDisconnectReason disconnectReason)
        {
            _onSessionLifecycleChanged();
        }

        public void OnDisplayNameChanged(string displayName) { }
        public void OnIconPathChanged(string iconPath) { }
        public void OnChannelVolumeChanged(uint channelCount, IntPtr newVolumes, uint channelIndex) { }
        public void OnGroupingParamChanged(ref Guid groupingId) { }
    }
}
