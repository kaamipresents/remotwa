using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
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
                if (_sessionManager != null)
                {
                    _sessionManager.OnSessionCreated -= SessionManager_OnSessionCreated;
                    _sessionManager.Dispose();
                    _sessionManager = null;
                }

                _defaultPlaybackDevice?.Dispose();
                _defaultPlaybackDevice = _deviceEnumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
                if (_defaultPlaybackDevice != null)
                {
                    _sessionManager = _defaultPlaybackDevice.AudioSessionManager;
                    _sessionManager.OnSessionCreated += SessionManager_OnSessionCreated;
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
        // A new session was created -> notify clients of session list changes
        _eventDispatcher(AudioEvent.SessionsChanged(GetSessions()));
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

                var sessions = _sessionManager.Sessions;
                for (int i = 0; i < sessions.Count; i++)
                {
                    var session = sessions[i];
                    uint pid = session.GetProcessID;
                    if (pid == 0) continue; // Skip system sounds / idle session

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

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        lock (_lock)
        {
            try
            {
                if (_sessionManager != null)
                {
                    _sessionManager.OnSessionCreated -= SessionManager_OnSessionCreated;
                    _sessionManager.Dispose();
                    _sessionManager = null;
                }

                _defaultPlaybackDevice?.Dispose();
                _defaultPlaybackDevice = null;
                _deviceEnumerator.Dispose();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SessionManager] Error disposing: {ex.Message}");
            }
        }
    }
}
