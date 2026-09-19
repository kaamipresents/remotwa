using System;
using System.Security.Cryptography;

namespace Remotva.Companion.Security;

public class PairingSession
{
    public string Pin { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public int FailedAttempts { get; set; }
    public bool IsActive => DateTime.UtcNow <= ExpiresAt && FailedAttempts < 3;
}

public class PairingManager
{
    private readonly TokenStore _tokenStore;
    private PairingSession? _currentSession;
    private readonly object _lock = new();

    public event Action? PairingSessionChanged;

    public PairingManager(TokenStore tokenStore)
    {
        _tokenStore = tokenStore ?? throw new ArgumentNullException(nameof(tokenStore));
    }

    public PairingSession StartNewSession()
    {
        lock (_lock)
        {
            // Generate a secure 6-digit PIN (100000 to 999999)
            int pinInt = RandomNumberGenerator.GetInt32(100000, 1000000);
            _currentSession = new PairingSession
            {
                Pin = pinInt.ToString("D6"),
                ExpiresAt = DateTime.UtcNow.AddSeconds(120),
                FailedAttempts = 0
            };

            try
            {
                string configDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Remotva");
                Directory.CreateDirectory(configDir);
                File.WriteAllText(Path.Combine(configDir, "active_pin.txt"), _currentSession.Pin);
            }
            catch { }

            PairingSessionChanged?.Invoke();
            return _currentSession;
        }
    }

    public PairingSession? GetActiveSession()
    {
        lock (_lock)
        {
            if (_currentSession != null && _currentSession.IsActive)
            {
                return _currentSession;
            }
            return null;
        }
    }

    public void CancelSession()
    {
        lock (_lock)
        {
            _currentSession = null;
            DeleteActivePinFile();
            PairingSessionChanged?.Invoke();
        }
    }

    public (bool success, string? token, string? error) TryPair(string pin, string clientName)
    {
        lock (_lock)
        {
            if (_currentSession == null || !_currentSession.IsActive)
            {
                return (false, null, "No active pairing session. Please click Pair on your PC.");
            }

            if (_currentSession.Pin != pin.Trim())
            {
                _currentSession.FailedAttempts++;
                if (_currentSession.FailedAttempts >= 3)
                {
                    _currentSession = null;
                    DeleteActivePinFile();
                    PairingSessionChanged?.Invoke();
                    return (false, null, "Too many failed attempts. Pairing session closed.");
                }
                return (false, null, $"Invalid PIN. {_currentSession.FailedAttempts}/3 attempts.");
            }

            // PIN is valid! Generate 32-byte cryptographically secure token
            byte[] tokenBytes = RandomNumberGenerator.GetBytes(32);
            string token = Convert.ToHexString(tokenBytes).ToLowerInvariant();

            _tokenStore.AddToken(token, string.IsNullOrWhiteSpace(clientName) ? "Mobile Client" : clientName);

            // Invalidate pairing session after one successful use
            _currentSession = null;
            DeleteActivePinFile();
            PairingSessionChanged?.Invoke();

            return (true, token, null);
        }
    }

    private static void DeleteActivePinFile()
    {
        try
        {
            string configDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Remotva");
            string pinFile = Path.Combine(configDir, "active_pin.txt");
            if (File.Exists(pinFile))
            {
                File.Delete(pinFile);
            }
        }
        catch { }
    }
}
