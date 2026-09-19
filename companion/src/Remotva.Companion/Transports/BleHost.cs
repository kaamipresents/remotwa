using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Windows.Devices.Bluetooth;
using Windows.Devices.Bluetooth.GenericAttributeProfile;
using Windows.Storage.Streams;
using Remotva.Companion.Protocol;
using Remotva.Companion.Security;

namespace Remotva.Companion.Transports;

public class BleHost : IDisposable
{
    // Remotva custom BLE GATT Service & Characteristic UUIDs
    public static readonly Guid RemotvaServiceUuid = new("18377000-7c1a-4d9f-9f3a-7140e4f20837");
    public static readonly Guid CommandCharUuid   = new("18377001-7c1a-4d9f-9f3a-7140e4f20837");
    public static readonly Guid EventCharUuid     = new("18377002-7c1a-4d9f-9f3a-7140e4f20837");
    public static readonly Guid ControlCharUuid   = new("18377003-7c1a-4d9f-9f3a-7140e4f20837");

    private readonly ProtocolEngine _protocolEngine;
    private readonly BleChunker _chunker = new();
    private GattServiceProvider? _serviceProvider;
    private GattLocalCharacteristic? _commandChar;
    private GattLocalCharacteristic? _eventChar;
    private GattLocalCharacteristic? _controlChar;

    private readonly ConcurrentDictionary<string, bool> _authenticatedSessions = new();
    private bool _isDisposed;
    private int _negotiatedMtu = 185;

    public bool IsSupported { get; private set; }
    public bool IsRunning { get; private set; }
    public int NegotiatedMtu => _negotiatedMtu;

    public BleHost(ProtocolEngine protocolEngine)
    {
        _protocolEngine = protocolEngine ?? throw new ArgumentNullException(nameof(protocolEngine));
    }

    public async Task StartAsync()
    {
        try
        {
            var defaultAdapter = await BluetoothAdapter.GetDefaultAsync();
            if (defaultAdapter == null)
            {
                Console.WriteLine("[BleHost] No Bluetooth adapter detected on this system.");
                IsSupported = false;
                return;
            }

            if (!defaultAdapter.IsPeripheralRoleSupported)
            {
                Console.WriteLine("[BleHost] Bluetooth adapter does not support the Peripheral role (GATT server).");
                IsSupported = false;
                return;
            }

            IsSupported = true;
            Console.WriteLine("[BleHost] Bluetooth peripheral role is supported. Initializing GATT service...");

            var serviceResult = await GattServiceProvider.CreateAsync(RemotvaServiceUuid);
            if (serviceResult.Error != BluetoothError.Success)
            {
                Console.WriteLine($"[BleHost] Failed to create GattServiceProvider: {serviceResult.Error}");
                return;
            }

            _serviceProvider = serviceResult.ServiceProvider;

            // 1. Command Characteristic (Phone -> PC write)
            var cmdParams = new GattLocalCharacteristicParameters
            {
                CharacteristicProperties = GattCharacteristicProperties.Write | GattCharacteristicProperties.WriteWithoutResponse,
                WriteProtectionLevel = GattProtectionLevel.Plain,
                UserDescription = "Remotva Command"
            };
            var cmdResult = await _serviceProvider.Service.CreateCharacteristicAsync(CommandCharUuid, cmdParams);
            if (cmdResult.Error == BluetoothError.Success)
            {
                _commandChar = cmdResult.Characteristic;
                _commandChar.WriteRequested += OnCommandWriteRequested;
            }

            // 2. Event Characteristic (PC -> Phone notifications)
            var evtParams = new GattLocalCharacteristicParameters
            {
                CharacteristicProperties = GattCharacteristicProperties.Notify,
                UserDescription = "Remotva Event"
            };
            var evtResult = await _serviceProvider.Service.CreateCharacteristicAsync(EventCharUuid, evtParams);
            if (evtResult.Error == BluetoothError.Success)
            {
                _eventChar = evtResult.Characteristic;
            }

            // 3. Control Characteristic (Read version, deviceId, MTU)
            var ctrlParams = new GattLocalCharacteristicParameters
            {
                CharacteristicProperties = GattCharacteristicProperties.Read,
                ReadProtectionLevel = GattProtectionLevel.Plain,
                UserDescription = "Remotva Control"
            };
            var ctrlResult = await _serviceProvider.Service.CreateCharacteristicAsync(ControlCharUuid, ctrlParams);
            if (ctrlResult.Error == BluetoothError.Success)
            {
                _controlChar = ctrlResult.Characteristic;
                _controlChar.ReadRequested += OnControlReadRequested;
            }

            // Start BLE advertising
            var advParameters = new GattServiceProviderAdvertisingParameters
            {
                IsConnectable = true,
                IsDiscoverable = true
            };
            _serviceProvider.StartAdvertising(advParameters);
            IsRunning = true;
            Console.WriteLine($"[BleHost] GATT Service advertised successfully with UUID {RemotvaServiceUuid}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[BleHost] Initialization error: {ex.Message}");
            IsRunning = false;
        }
    }

    private async void OnCommandWriteRequested(GattLocalCharacteristic sender, GattWriteRequestedEventArgs args)
    {
        var deferral = args.GetDeferral();
        try
        {
            var request = await args.GetRequestAsync();
            if (request == null) return;

            var buffer = request.Value;
            var reader = DataReader.FromBuffer(buffer);
            var chunk = new byte[reader.UnconsumedBufferLength];
            reader.ReadBytes(chunk);

            string clientKey = "ble_client"; // Per-client identifier or session
            var responsePayload = await ProcessChunkAsync(chunk, clientKey);

            if (responsePayload != null && _eventChar != null)
            {
                // Send response chunks via Event characteristic notifications
                var responseChunks = _chunker.Chunk(responsePayload, _negotiatedMtu);
                foreach (var respChunk in responseChunks)
                {
                    var outBuffer = respChunk.AsBuffer();
                    await _eventChar.NotifyValueAsync(outBuffer);
                }
            }

            if (request.Option == GattWriteOption.WriteWithResponse)
            {
                request.Respond();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[BleHost] Error handling Command write: {ex.Message}");
        }
        finally
        {
            deferral.Complete();
        }
    }

    private async void OnControlReadRequested(GattLocalCharacteristic sender, GattReadRequestedEventArgs args)
    {
        var deferral = args.GetDeferral();
        try
        {
            var request = await args.GetRequestAsync();
            if (request == null) return;

            var info = new
            {
                version = 1,
                deviceId = DeviceIdentity.GetDeviceId(),
                mtu = _negotiatedMtu
            };
            byte[] infoBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(info));
            request.RespondWithValue(infoBytes.AsBuffer());
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[BleHost] Error handling Control read: {ex.Message}");
        }
        finally
        {
            deferral.Complete();
        }
    }

    /// <summary>
    /// Processes an incoming raw chunk from the transport. If the chunk completes a message,
    /// executes the protocol engine (with BLE constraints applied) and returns serialized response bytes.
    /// </summary>
    public async Task<byte[]?> ProcessChunkAsync(byte[] rawChunk, string clientSessionId = "default")
    {
        if (!_chunker.TryReassemble(rawChunk, out byte[]? fullMessage) || fullMessage == null)
        {
            return null;
        }

        var envelope = BleCodec.Decode(fullMessage);
        if (envelope == null)
        {
            return null;
        }

        bool isAuthenticated = _authenticatedSessions.TryGetValue(clientSessionId, out bool auth) && auth;

        // Apply BLE bandwidth constraints:
        // 1. For getSessions on BLE: filter sessions to active-only
        // 2. For getAlbumArt on BLE: clamp maxSize to 96 and return ERR_TOO_LARGE if > 8KB
        if (envelope.Method == "getAlbumArt" && envelope.Payload.HasValue)
        {
            envelope = AdaptAlbumArtRequestForBle(envelope);
        }

        var response = await _protocolEngine.HandleCommandAsync(
            envelope,
            () => isAuthenticated,
            () => _authenticatedSessions[clientSessionId] = true
        );

        // Check if response exceeds BLE size limit (8KB cap for art or general payloads)
        if (response.Method == null && envelope.Method == "getAlbumArt" && response.Ok == true)
        {
            response = ValidateAlbumArtResponseSize(response, envelope.Id ?? "c");
        }

        if (response.Method == null && envelope.Method == "getSessions" && response.Ok == true)
        {
            response = FilterActiveSessionsForBle(response, envelope.Id ?? "c");
        }

        return BleCodec.Encode(response);
    }

    private static ProtocolEnvelope AdaptAlbumArtRequestForBle(ProtocolEnvelope envelope)
    {
        try
        {
            string trackId = "";
            if (envelope.Payload.HasValue && envelope.Payload.Value.TryGetProperty("trackId", out var tProp))
            {
                trackId = tProp.GetString() ?? "";
            }

            var adapted = new { trackId = trackId, maxSize = 96 };
            string json = JsonSerializer.Serialize(adapted);
            using var doc = JsonDocument.Parse(json);

            return new ProtocolEnvelope
            {
                Version = envelope.Version,
                Type = envelope.Type,
                Id = envelope.Id,
                Method = envelope.Method,
                Payload = doc.RootElement.Clone()
            };
        }
        catch
        {
            return envelope;
        }
    }

    private static ProtocolEnvelope ValidateAlbumArtResponseSize(ProtocolEnvelope response, string id)
    {
        if (response.Payload.HasValue && response.Payload.Value.TryGetProperty("data", out var dataProp))
        {
            string? base64 = dataProp.GetString();
            if (base64 != null)
            {
                byte[] rawData = Convert.FromBase64String(base64);
                if (rawData.Length > 8192)
                {
                    return ProtocolEnvelope.CreateError(id, ErrorCodes.ErrTooLarge, "Album art exceeds BLE 8KB limit.");
                }
            }
        }
        return response;
    }

    private static ProtocolEnvelope FilterActiveSessionsForBle(ProtocolEnvelope response, string id)
    {
        if (response.Payload.HasValue && response.Payload.Value.TryGetProperty("sessions", out var sessProp))
        {
            try
            {
                var sessions = JsonSerializer.Deserialize<List<AudioSessionInfo>>(sessProp.GetRawText());
                if (sessions != null)
                {
                    // BLE constraint: send only sessions producing audio or marked active
                    var activeOnly = sessions.Where(s => s.Active).ToList();
                    return ProtocolEnvelope.CreateResponse(id, new { sessions = activeOnly });
                }
            }
            catch
            {
                // Preserve original if parsing fails
            }
        }
        return response;
    }

    public async Task BroadcastEventAsync(ProtocolEnvelope evt)
    {
        if (_eventChar == null || !IsRunning) return;

        try
        {
            byte[] encoded = BleCodec.Encode(evt);
            var chunks = _chunker.Chunk(encoded, _negotiatedMtu);
            foreach (var chunk in chunks)
            {
                await _eventChar.NotifyValueAsync(chunk.AsBuffer());
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[BleHost] Event broadcast error: {ex.Message}");
        }
    }

    public void Stop()
    {
        try
        {
            if (_serviceProvider != null)
            {
                _serviceProvider.StopAdvertising();
                _serviceProvider = null;
            }
            IsRunning = false;
            Console.WriteLine("[BleHost] GATT Service stopped.");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[BleHost] Error stopping GATT service: {ex.Message}");
        }
    }

    public void Dispose()
    {
        if (_isDisposed) return;
        _isDisposed = true;
        Stop();
    }
}
