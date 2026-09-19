using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Remotva.Companion.Protocol;
using Remotva.Companion.Security;

namespace Remotva.Companion.Transports;

public class WsHost : IDisposable
{
    private readonly ProtocolEngine _protocolEngine;
    private TcpListener? _listener;
    private readonly ConcurrentDictionary<Guid, ClientSession> _clients = new();
    private readonly CancellationTokenSource _cts = new();
    private Task? _listenerTask;
    private bool _disposed;
    public int Port { get; } = 8377;

    public int ActiveClientCount => _clients.Count;

    public WsHost(ProtocolEngine protocolEngine)
    {
        _protocolEngine = protocolEngine ?? throw new ArgumentNullException(nameof(protocolEngine));
    }

    public void Start()
    {
        try
        {
            // Bind to all interfaces (LAN and Localhost) on port 8377
            // Unlike HttpListener/http.sys, standard TCP sockets do not require admin URL ACLs
            _listener = new TcpListener(IPAddress.Any, Port);
            _listener.Start();
            Console.WriteLine($"[WsHost] WebSocket server started on 0.0.0.0:{Port}");
            _listenerTask = Task.Run(AcceptLoopAsync);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[WsHost] Error starting TCP listener on port {Port}: {ex.Message}");
        }
    }

    private async Task AcceptLoopAsync()
    {
        if (_listener == null) return;

        while (!_cts.Token.IsCancellationRequested)
        {
            try
            {
                var tcpClient = await _listener.AcceptTcpClientAsync(_cts.Token);
                _ = ProcessClientConnectionAsync(tcpClient);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WsHost] Accept error: {ex.Message}");
            }
        }
    }

    private async Task ProcessClientConnectionAsync(TcpClient tcpClient)
    {
        var stream = tcpClient.GetStream();
        var buffer = new byte[4096];
        var headerBuilder = new StringBuilder();

        try
        {
            // Read HTTP request header
            while (true)
            {
                int read = await stream.ReadAsync(buffer, 0, buffer.Length, _cts.Token);
                if (read == 0) return;

                headerBuilder.Append(Encoding.UTF8.GetString(buffer, 0, read));
                if (headerBuilder.ToString().Contains("\r\n\r\n"))
                {
                    break;
                }
            }

            string requestText = headerBuilder.ToString();

            // Check if WebSocket upgrade request
            var keyMatch = Regex.Match(requestText, @"Sec-WebSocket-Key:\s*(\S+)", RegexOptions.IgnoreCase);
            if (keyMatch.Success)
            {
                string clientKey = keyMatch.Groups[1].Value.Trim();
                string acceptKey = GenerateSecWebSocketAccept(clientKey);

                string responseHeaders =
                    "HTTP/1.1 101 Switching Protocols\r\n" +
                    "Upgrade: websocket\r\n" +
                    "Connection: Upgrade\r\n" +
                    $"Sec-WebSocket-Accept: {acceptKey}\r\n\r\n";

                byte[] headerBytes = Encoding.UTF8.GetBytes(responseHeaders);
                await stream.WriteAsync(headerBytes, 0, headerBytes.Length, _cts.Token);

                // Create standard WebSocket from network stream
                var webSocket = WebSocket.CreateFromStream(
                    stream,
                    isServer: true,
                    subProtocol: null,
                    keepAliveInterval: TimeSpan.FromSeconds(30)
                );

                await RunWebSocketSessionAsync(webSocket);
            }
            else
            {
                // Regular HTTP health check or info response
                string body = JsonSerializer.Serialize(new
                {
                    service = "remotva-companion",
                    v = 1,
                    status = "running",
                    deviceId = DeviceIdentity.GetDeviceId()
                });

                string response =
                    "HTTP/1.1 200 OK\r\n" +
                    "Content-Type: application/json\r\n" +
                    $"Content-Length: {Encoding.UTF8.GetByteCount(body)}\r\n" +
                    "Connection: close\r\n\r\n" +
                    body;

                byte[] resBytes = Encoding.UTF8.GetBytes(response);
                await stream.WriteAsync(resBytes, 0, resBytes.Length, _cts.Token);
                tcpClient.Close();
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            tcpClient.Close();
        }
    }

    private async Task RunWebSocketSessionAsync(WebSocket socket)
    {
        var session = new ClientSession(socket);
        _clients[session.Id] = session;

        // 5-second authentication timeout: rule from spec
        var authTimeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(5000, authTimeoutCts.Token);
                if (!session.IsAuthenticated && session.Socket.State == WebSocketState.Open)
                {
                    Console.WriteLine($"[WsHost] Client {session.Id} failed to authenticate within 5s. Closing socket.");
                    await session.Socket.CloseAsync(WebSocketCloseStatus.PolicyViolation, "Auth timeout", CancellationToken.None);
                }
            }
            catch (OperationCanceledException) { }
        });

        try
        {
            var buffer = new byte[8192];
            var ms = new MemoryStream();

            while (session.Socket.State == WebSocketState.Open && !_cts.Token.IsCancellationRequested)
            {
                ms.SetLength(0);
                WebSocketReceiveResult result;
                do
                {
                    result = await session.Socket.ReceiveAsync(new ArraySegment<byte>(buffer), _cts.Token);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        await session.Socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                        return;
                    }
                    ms.Write(buffer, 0, result.Count);
                } while (!result.EndOfMessage);

                if (result.MessageType == WebSocketMessageType.Text)
                {
                    string json = Encoding.UTF8.GetString(ms.ToArray());
                    await HandleIncomingMessageAsync(session, json, authTimeoutCts);
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Socket aborted / connection dropped
        }
        finally
        {
            authTimeoutCts.Cancel();
            authTimeoutCts.Dispose();
            _clients.TryRemove(session.Id, out _);
            session.Dispose();
        }
    }

    private async Task HandleIncomingMessageAsync(ClientSession session, string json, CancellationTokenSource authTimeoutCts)
    {
        try
        {
            var envelope = JsonSerializer.Deserialize<ProtocolEnvelope>(json);
            if (envelope == null) return;

            var response = await _protocolEngine.HandleCommandAsync(
                envelope,
                () => session.IsAuthenticated,
                () =>
                {
                    session.IsAuthenticated = true;
                    authTimeoutCts.Cancel(); // Cancel 5s timer once authenticated
                }
            );

            await SendEnvelopeAsync(session, response);
        }
        catch (Exception ex)
        {
            var err = ProtocolEnvelope.CreateError("error", ErrorCodes.ErrInternal, ex.Message);
            await SendEnvelopeAsync(session, err);
        }
    }

    private async Task SendEnvelopeAsync(ClientSession session, ProtocolEnvelope envelope)
    {
        if (session.Socket.State != WebSocketState.Open) return;

        try
        {
            string json = JsonSerializer.Serialize(envelope);
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            await session.SendLock.WaitAsync();
            try
            {
                if (session.Socket.State == WebSocketState.Open)
                {
                    await session.Socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
                }
            }
            finally
            {
                session.SendLock.Release();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[WsHost] Send error to {session.Id}: {ex.Message}");
        }
    }

    public async Task BroadcastEventAsync(ProtocolEnvelope evtEnvelope)
    {
        string json = JsonSerializer.Serialize(evtEnvelope);
        byte[] bytes = Encoding.UTF8.GetBytes(json);

        var tasks = new List<Task>();
        foreach (var session in _clients.Values)
        {
            if (session.IsAuthenticated && session.Socket.State == WebSocketState.Open)
            {
                tasks.Add(Task.Run(async () =>
                {
                    await session.SendLock.WaitAsync();
                    try
                    {
                        if (session.Socket.State == WebSocketState.Open)
                        {
                            await session.Socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
                        }
                    }
                    catch { }
                    finally
                    {
                        session.SendLock.Release();
                    }
                }));
            }
        }

        if (tasks.Count > 0)
        {
            await Task.WhenAll(tasks);
        }
    }

    private static string GenerateSecWebSocketAccept(string clientKey)
    {
        const string magicGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
        byte[] hash = SHA1.HashData(Encoding.UTF8.GetBytes(clientKey + magicGuid));
        return Convert.ToBase64String(hash);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        _cts.Cancel();
        try
        {
            _listener?.Stop();
        }
        catch { }

        foreach (var session in _clients.Values)
        {
            session.Dispose();
        }
        _clients.Clear();
        _cts.Dispose();
    }

    private class ClientSession : IDisposable
    {
        public Guid Id { get; } = Guid.NewGuid();
        public WebSocket Socket { get; }
        public bool IsAuthenticated { get; set; }
        public SemaphoreSlim SendLock { get; } = new(1, 1);

        public ClientSession(WebSocket socket)
        {
            Socket = socket;
        }

        public void Dispose()
        {
            try
            {
                Socket.Dispose();
            }
            catch { }
            SendLock.Dispose();
        }
    }
}
