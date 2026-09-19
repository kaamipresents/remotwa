using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace Remotva.Companion.Security;

public class PairedDevice
{
    public string Token { get; set; } = string.Empty;
    public string ClientName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastUsedAt { get; set; } = DateTime.UtcNow;
}

public class TokenStore
{
    private static readonly string ConfigDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Remotva"
    );

    private static readonly string TokensFile = Path.Combine(ConfigDir, "tokens.json");
    private readonly List<PairedDevice> _tokens = new();
    private readonly object _lock = new();

    public TokenStore()
    {
        Load();
    }

    private void Load()
    {
        lock (_lock)
        {
            try
            {
                if (File.Exists(TokensFile))
                {
                    string json = File.ReadAllText(TokensFile);
                    var list = JsonSerializer.Deserialize<List<PairedDevice>>(json);
                    if (list != null)
                    {
                        _tokens.Clear();
                        _tokens.AddRange(list);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TokenStore] Error loading tokens: {ex.Message}");
            }
        }
    }

    private void Save()
    {
        lock (_lock)
        {
            try
            {
                Directory.CreateDirectory(ConfigDir);
                string json = JsonSerializer.Serialize(_tokens, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(TokensFile, json);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TokenStore] Error saving tokens: {ex.Message}");
            }
        }
    }

    public bool ValidateToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token)) return false;

        lock (_lock)
        {
            var device = _tokens.FirstOrDefault(t => t.Token == token);
            if (device != null)
            {
                device.LastUsedAt = DateTime.UtcNow;
                Save();
                return true;
            }
            return false;
        }
    }

    public void AddToken(string token, string clientName)
    {
        lock (_lock)
        {
            _tokens.RemoveAll(t => t.Token == token);
            _tokens.Add(new PairedDevice
            {
                Token = token,
                ClientName = clientName,
                CreatedAt = DateTime.UtcNow,
                LastUsedAt = DateTime.UtcNow
            });
            Save();
        }
    }

    public void RevokeToken(string token)
    {
        lock (_lock)
        {
            _tokens.RemoveAll(t => t.Token == token);
            Save();
        }
    }

    public List<PairedDevice> GetAll()
    {
        lock (_lock)
        {
            return _tokens.ToList();
        }
    }
}
