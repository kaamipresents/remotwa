using System;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;

namespace Remotva.Companion.Utils;

public class SerializedChannel : IDisposable
{
    private readonly Channel<AudioEvent> _channel;
    private readonly Func<AudioEvent, Task> _eventConsumer;
    private readonly CancellationTokenSource _cts = new();
    private Task? _consumerTask;
    private bool _disposed;

    public SerializedChannel(Func<AudioEvent, Task> eventConsumer)
    {
        _eventConsumer = eventConsumer ?? throw new ArgumentNullException(nameof(eventConsumer));
        _channel = Channel.CreateUnbounded<AudioEvent>(new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false
        });
    }

    public void Start()
    {
        _consumerTask = Task.Run(ProcessQueueAsync);
    }

    public void Enqueue(AudioEvent ev)
    {
        _channel.Writer.TryWrite(ev);
    }

    private async Task ProcessQueueAsync()
    {
        var reader = _channel.Reader;
        try
        {
            while (await reader.WaitToReadAsync(_cts.Token))
            {
                while (reader.TryRead(out var ev))
                {
                    try
                    {
                        await _eventConsumer(ev);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[SerializedChannel] Consumer error: {ex.Message}");
                    }
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Expected on shutdown
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        _cts.Cancel();
        _channel.Writer.TryComplete();
        try
        {
            _consumerTask?.Wait(1000);
        }
        catch { }
        _cts.Dispose();
    }
}
