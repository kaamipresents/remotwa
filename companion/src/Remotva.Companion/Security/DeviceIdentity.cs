using System;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace Remotva.Companion.Security;

public static class DeviceIdentity
{
    private static readonly string ConfigDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Remotva"
    );

    private static readonly string IdFile = Path.Combine(ConfigDir, "device_id.txt");

    private static string? _cachedDeviceId;

    public static string GetDeviceId()
    {
        if (_cachedDeviceId != null) return _cachedDeviceId;

        try
        {
            Directory.CreateDirectory(ConfigDir);
            if (File.Exists(IdFile))
            {
                string id = File.ReadAllText(IdFile).Trim();
                if (!string.IsNullOrEmpty(id))
                {
                    _cachedDeviceId = id;
                    return id;
                }
            }

            string newId = Guid.NewGuid().ToString("N");
            File.WriteAllText(IdFile, newId);
            _cachedDeviceId = newId;
            return newId;
        }
        catch
        {
            return Guid.NewGuid().ToString("N");
        }
    }

    public static IPAddress? GetLocalLanIp()
    {
        try
        {
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up ||
                    ni.NetworkInterfaceType == NetworkInterfaceType.Loopback)
                {
                    continue;
                }

                var ipProps = ni.GetIPProperties();
                foreach (var addr in ipProps.UnicastAddresses)
                {
                    if (addr.Address.AddressFamily == AddressFamily.InterNetwork &&
                        !IPAddress.IsLoopback(addr.Address))
                    {
                        return addr.Address;
                    }
                }
            }
        }
        catch { }

        return IPAddress.Loopback;
    }
}
