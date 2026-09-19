using System;
using System.Diagnostics;
using System.Threading.Tasks;
using Windows.Networking.Connectivity;

namespace Remotva.Companion.Utils;

public class NetworkChecker : IDisposable
{
    private readonly Action<string> _onPublicNetworkDetected;
    private bool _hasShownWarning;
    private bool _disposed;

    public NetworkChecker(Action<string> onPublicNetworkDetected)
    {
        _onPublicNetworkDetected = onPublicNetworkDetected ?? throw new ArgumentNullException(nameof(onPublicNetworkDetected));
        
        try
        {
            NetworkInformation.NetworkStatusChanged += OnNetworkStatusChanged;
        }
        catch
        {
            // Fallback if WinRT event registration fails
        }
    }

    public void CheckNetworkProfileAsync()
    {
        Task.Run(() =>
        {
            try
            {
                bool isPublic = IsActiveNetworkPublic();
                if (isPublic && !_hasShownWarning)
                {
                    _hasShownWarning = true;
                    _onPublicNetworkDetected(
                        "Network is set to Public — your phone may not be able to find this PC. Switch to Private in Windows Settings."
                    );
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[NetworkChecker] Error checking profile: {ex.Message}");
            }
        });
    }

    private void OnNetworkStatusChanged(object? sender)
    {
        CheckNetworkProfileAsync();
    }

    private static bool IsActiveNetworkPublic()
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -Command \"(Get-NetConnectionProfile).NetworkCategory\"",
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process == null) return false;

            string output = process.StandardOutput.ReadToEnd();
            process.WaitForExit(3000);

            return output.Contains("Public", StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        try
        {
            NetworkInformation.NetworkStatusChanged -= OnNetworkStatusChanged;
        }
        catch { }
    }
}
