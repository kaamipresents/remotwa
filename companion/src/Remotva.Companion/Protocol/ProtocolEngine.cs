using System;
using System.Text.Json;
using System.Threading.Tasks;
using Remotva.Companion.Audio;
using Remotva.Companion.Media;
using Remotva.Companion.Security;

namespace Remotva.Companion.Protocol;

public class ProtocolEngine
{
    private readonly AudioController _audioController;
    private readonly SessionManager _sessionManager;
    private readonly MediaController _mediaController;
    private readonly TokenStore _tokenStore;
    private readonly PairingManager _pairingManager;

    public ProtocolEngine(
        AudioController audioController,
        SessionManager sessionManager,
        MediaController mediaController,
        TokenStore tokenStore,
        PairingManager pairingManager)
    {
        _audioController = audioController;
        _sessionManager = sessionManager;
        _mediaController = mediaController;
        _tokenStore = tokenStore;
        _pairingManager = pairingManager;
    }

    public async Task<ProtocolEnvelope> HandleCommandAsync(ProtocolEnvelope request, Func<bool> isAuthenticated, Action markAuthenticated)
    {
        string id = request.Id ?? "unknown";
        string method = request.Method ?? string.Empty;

        // Public commands before authentication: hello, pair, ping
        if (method == "ping")
        {
            return ProtocolEnvelope.CreateResponse(id, new
            {
                serverTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            });
        }

        if (method == "hello")
        {
            return HandleHello(request, id, markAuthenticated);
        }

        if (method == "pair")
        {
            return HandlePair(request, id, markAuthenticated);
        }

        // All other commands require authentication
        if (!isAuthenticated())
        {
            return ProtocolEnvelope.CreateError(id, ErrorCodes.ErrAuth, "Authentication required. Present a valid token or pair first.");
        }

        try
        {
            return method switch
            {
                "getState" => HandleGetState(id),
                "setVolume" => HandleSetVolume(request, id),
                "setMute" => HandleSetMute(request, id),
                "adjustVolume" => HandleAdjustVolume(request, id),
                "transport" => await HandleTransportAsync(request, id),
                "getSessions" => HandleGetSessions(id),
                "setSessionVolume" => HandleSetSessionVolume(request, id),
                "setSessionMute" => HandleSetSessionMute(request, id),
                "getAlbumArt" => HandleGetAlbumArt(request, id),
                _ => ProtocolEnvelope.CreateError(id, ErrorCodes.ErrUnknownCmd, $"Unknown command: {method}")
            };
        }
        catch (Exception ex)
        {
            return ProtocolEnvelope.CreateError(id, ErrorCodes.ErrInternal, ex.Message);
        }
    }

    private ProtocolEnvelope HandleHello(ProtocolEnvelope request, string id, Action markAuthenticated)
    {
        string? token = null;
        if (request.Payload.HasValue && request.Payload.Value.TryGetProperty("token", out var tokenProp))
        {
            token = tokenProp.GetString();
        }

        if (!string.IsNullOrEmpty(token) && _tokenStore.ValidateToken(token))
        {
            markAuthenticated();
            return ProtocolEnvelope.CreateResponse(id, new HelloResponse
            {
                ServerName = Environment.MachineName,
                DeviceId = DeviceIdentity.GetDeviceId(),
                Version = 1,
                Capabilities = new() { "wifi", "ble" }
            });
        }

        return ProtocolEnvelope.CreateError(id, ErrorCodes.ErrAuth, "Invalid or missing token. Pairing required.");
    }

    private ProtocolEnvelope HandlePair(ProtocolEnvelope request, string id, Action markAuthenticated)
    {
        if (!request.Payload.HasValue)
        {
            return ProtocolEnvelope.CreateError(id, ErrorCodes.ErrBadPayload, "Missing pairing payload.");
        }

        string pin = string.Empty;
        string clientName = "Mobile Device";

        if (request.Payload.Value.TryGetProperty("pin", out var pinProp))
        {
            pin = pinProp.GetString() ?? string.Empty;
        }

        if (request.Payload.Value.TryGetProperty("clientName", out var clientProp))
        {
            clientName = clientProp.GetString() ?? clientName;
        }

        var (success, token, error) = _pairingManager.TryPair(pin, clientName);
        if (success && token != null)
        {
            markAuthenticated();
            return ProtocolEnvelope.CreateResponse(id, new PairResponse
            {
                Token = token,
                DeviceId = DeviceIdentity.GetDeviceId()
            });
        }

        return ProtocolEnvelope.CreateError(id, ErrorCodes.ErrAuth, error ?? "Pairing failed.");
    }

    public SystemStateSnapshot GetCurrentSnapshot()
    {
        return new SystemStateSnapshot
        {
            Master = _audioController.GetMasterVolume(),
            Track = _mediaController.GetCurrentTrack(),
            Sessions = _sessionManager.GetSessions()
        };
    }

    private ProtocolEnvelope HandleGetState(string id)
    {
        return ProtocolEnvelope.CreateResponse(id, GetCurrentSnapshot());
    }

    private ProtocolEnvelope HandleSetVolume(ProtocolEnvelope request, string id)
    {
        if (request.Payload.HasValue && request.Payload.Value.TryGetProperty("level", out var levelProp))
        {
            float level = (float)levelProp.GetDouble();
            float newLevel = _audioController.SetMasterVolume(level);
            return ProtocolEnvelope.CreateResponse(id, new { level = newLevel });
        }
        return ProtocolEnvelope.CreateError(id, ErrorCodes.ErrBadPayload, "Missing 'level' field in payload.");
    }

    private ProtocolEnvelope HandleSetMute(ProtocolEnvelope request, string id)
    {
        if (request.Payload.HasValue && request.Payload.Value.TryGetProperty("muted", out var muteProp))
        {
            bool muted = muteProp.GetBoolean();
            bool newMuted = _audioController.SetMute(muted);
            return ProtocolEnvelope.CreateResponse(id, new { muted = newMuted });
        }
        return ProtocolEnvelope.CreateError(id, ErrorCodes.ErrBadPayload, "Missing 'muted' field in payload.");
    }

    private ProtocolEnvelope HandleAdjustVolume(ProtocolEnvelope request, string id)
    {
        if (request.Payload.HasValue && request.Payload.Value.TryGetProperty("delta", out var deltaProp))
        {
            float delta = (float)deltaProp.GetDouble();
            float newLevel = _audioController.AdjustVolume(delta);
            return ProtocolEnvelope.CreateResponse(id, new { level = newLevel });
        }
        return ProtocolEnvelope.CreateError(id, ErrorCodes.ErrBadPayload, "Missing 'delta' field in payload.");
    }

    private async Task<ProtocolEnvelope> HandleTransportAsync(ProtocolEnvelope request, string id)
    {
        if (request.Payload.HasValue && request.Payload.Value.TryGetProperty("action", out var actionProp))
        {
            string? action = actionProp.GetString();
            if (string.IsNullOrEmpty(action))
            {
                return ProtocolEnvelope.CreateError(id, ErrorCodes.ErrBadPayload, "Missing 'action' field in payload.");
            }

            try
            {
                string playState = await _mediaController.ExecuteTransportAsync(action);
                return ProtocolEnvelope.CreateResponse(id, new { playState });
            }
            catch (InvalidOperationException ex) when (ex.Message == ErrorCodes.ErrNoMedia)
            {
                return ProtocolEnvelope.CreateError(id, ErrorCodes.ErrNoMedia, "No active media session.");
            }
        }
        return ProtocolEnvelope.CreateError(id, ErrorCodes.ErrBadPayload, "Missing 'action' field.");
    }

    private ProtocolEnvelope HandleGetSessions(string id)
    {
        var sessions = _sessionManager.GetSessions();
        return ProtocolEnvelope.CreateResponse(id, new { sessions });
    }

    private ProtocolEnvelope HandleSetSessionVolume(ProtocolEnvelope request, string id)
    {
        if (request.Payload.HasValue &&
            request.Payload.Value.TryGetProperty("sessionId", out var sidProp) &&
            request.Payload.Value.TryGetProperty("level", out var lvlProp))
        {
            string? sessionId = sidProp.GetString();
            float level = (float)lvlProp.GetDouble();
            if (!string.IsNullOrEmpty(sessionId))
            {
                float newLevel = _sessionManager.SetSessionVolume(sessionId, level);
                return ProtocolEnvelope.CreateResponse(id, new { level = newLevel });
            }
        }
        return ProtocolEnvelope.CreateError(id, ErrorCodes.ErrBadPayload, "Missing 'sessionId' or 'level'.");
    }

    private ProtocolEnvelope HandleSetSessionMute(ProtocolEnvelope request, string id)
    {
        if (request.Payload.HasValue &&
            request.Payload.Value.TryGetProperty("sessionId", out var sidProp) &&
            request.Payload.Value.TryGetProperty("muted", out var muteProp))
        {
            string? sessionId = sidProp.GetString();
            bool muted = muteProp.GetBoolean();
            if (!string.IsNullOrEmpty(sessionId))
            {
                bool newMute = _sessionManager.SetSessionMute(sessionId, muted);
                return ProtocolEnvelope.CreateResponse(id, new { muted = newMute });
            }
        }
        return ProtocolEnvelope.CreateError(id, ErrorCodes.ErrBadPayload, "Missing 'sessionId' or 'muted'.");
    }

    private ProtocolEnvelope HandleGetAlbumArt(ProtocolEnvelope request, string id)
    {
        if (request.Payload.HasValue && request.Payload.Value.TryGetProperty("trackId", out var trackProp))
        {
            string? trackId = trackProp.GetString();
            int maxSize = 300;
            if (request.Payload.Value.TryGetProperty("maxSize", out var maxProp))
            {
                maxSize = maxProp.GetInt32();
            }

            if (!string.IsNullOrEmpty(trackId))
            {
                byte[]? art = _mediaController.GetAlbumArt(trackId, maxSize);
                if (art != null)
                {
                    return ProtocolEnvelope.CreateResponse(id, new
                    {
                        mime = "image/jpeg",
                        data = Convert.ToBase64String(art)
                    });
                }
            }
        }
        return ProtocolEnvelope.CreateError(id, ErrorCodes.ErrBadPayload, "Album art not found or invalid trackId.");
    }
}
