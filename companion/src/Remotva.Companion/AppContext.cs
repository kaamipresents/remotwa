using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;
using Remotva.Companion.Audio;
using Remotva.Companion.Media;
using Remotva.Companion.Protocol;
using Remotva.Companion.Security;
using Remotva.Companion.Transports;
using Remotva.Companion.UI;
using Remotva.Companion.Utils;

namespace Remotva.Companion;

public class AppContext : ApplicationContext
{
    private readonly NotifyIcon _trayIcon;
    private readonly ContextMenuStrip _trayMenu;
    private readonly SerializedChannel _eventChannel;
    private readonly AudioController _audioController;
    private readonly SessionManager _sessionManager;
    private readonly MediaController _mediaController;
    private readonly TokenStore _tokenStore;
    private readonly PairingManager _pairingManager;
    private readonly ProtocolEngine _protocolEngine;
    private readonly WsHost _wsHost;
    private readonly BleHost _bleHost;
    private readonly NetworkChecker _networkChecker;

    private PairingForm? _activePairingForm;
    private SettingsForm? _activeSettingsForm;

    public AppContext(string[] args)
    {
        // 1. Initialize Threading Channel to marshal callbacks
        _eventChannel = new SerializedChannel(OnSerializedAudioEventAsync);

        // 2. Initialize Audio & Media Subsystems
        _audioController = new AudioController(ev => _eventChannel.Enqueue(ev));
        _sessionManager = new SessionManager(ev => _eventChannel.Enqueue(ev));
        _mediaController = new MediaController(ev => _eventChannel.Enqueue(ev));

        // 3. Initialize Security & Pairing
        _tokenStore = new TokenStore();
        _pairingManager = new PairingManager(_tokenStore);

        // 4. Initialize Protocol Engine, WebSocket Host, and BLE Host
        _protocolEngine = new ProtocolEngine(
            _audioController,
            _sessionManager,
            _mediaController,
            _tokenStore,
            _pairingManager
        );

        _wsHost = new WsHost(_protocolEngine);
        _bleHost = new BleHost(_protocolEngine);

        // 5. Start Channel consumer, WS server, and BLE peripheral
        _eventChannel.Start();
        _wsHost.Start();
        _ = _bleHost.StartAsync();
        _ = _mediaController.InitializeAsync();

        if (args.Contains("--start-pairing"))
        {
            _pairingManager.StartNewSession();
            ShowPairingDialog();
        }

        // 6. Setup Tray Menu & NotifyIcon
        _trayMenu = new ContextMenuStrip();
        var statusItem = new ToolStripMenuItem("Remotva — Ready") { Enabled = false };
        var pairItem = new ToolStripMenuItem("Pair New Device...", null, (s, e) => ShowPairingDialog());
        var settingsItem = new ToolStripMenuItem("Settings...", null, (s, e) => ShowSettingsDialog());
        var exitItem = new ToolStripMenuItem("Exit", null, (s, e) => ExitApplication());

        _trayMenu.Items.Add(statusItem);
        _trayMenu.Items.Add(new ToolStripSeparator());
        _trayMenu.Items.Add(pairItem);
        _trayMenu.Items.Add(settingsItem);
        _trayMenu.Items.Add(new ToolStripSeparator());
        _trayMenu.Items.Add(exitItem);

        _trayIcon = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            ContextMenuStrip = _trayMenu,
            Text = "Remotva Audio Remote",
            Visible = true
        };

        _trayIcon.DoubleClick += (s, e) => ShowPairingDialog();

        // 7. Non-blocking Network Profile Check (Warns if active network is Public)
        _networkChecker = new NetworkChecker(msg =>
        {
            _trayIcon.ShowBalloonTip(5000, "Remotva Network Warning", msg, ToolTipIcon.Warning);
        });
        _networkChecker.CheckNetworkProfileAsync();
    }

    private async Task OnSerializedAudioEventAsync(AudioEvent ev)
    {
        string? eventName = ev.Type switch
        {
            AudioEventType.VolumeChanged => "volumeChanged",
            AudioEventType.SessionsChanged => "sessionsChanged",
            AudioEventType.SessionVolumeChanged => "sessionVolumeChanged",
            AudioEventType.TrackChanged => "trackChanged",
            AudioEventType.PlayStateChanged => "playStateChanged",
            AudioEventType.ServerShutdown => "serverShutdown",
            _ => null
        };

        if (eventName != null)
        {
            var envelope = ProtocolEnvelope.CreateEvent(eventName, ev.Data);
            await _wsHost.BroadcastEventAsync(envelope);
            if (_bleHost.IsRunning)
            {
                await _bleHost.BroadcastEventAsync(envelope);
            }
        }
    }

    private void ShowPairingDialog()
    {
        if (_activePairingForm == null || _activePairingForm.IsDisposed)
        {
            _activePairingForm = new PairingForm(_pairingManager, _wsHost.Port);
            _activePairingForm.Show();
        }
        else
        {
            _activePairingForm.BringToFront();
        }
    }

    private void ShowSettingsDialog()
    {
        if (_activeSettingsForm == null || _activeSettingsForm.IsDisposed)
        {
            _activeSettingsForm = new SettingsForm(_tokenStore, _wsHost.Port);
            _activeSettingsForm.Show();
        }
        else
        {
            _activeSettingsForm.BringToFront();
        }
    }

    private void ExitApplication()
    {
        _trayIcon.Visible = false;
        _trayIcon.Dispose();

        _networkChecker.Dispose();
        _bleHost.Dispose();
        _wsHost.Dispose();
        _eventChannel.Dispose();
        _mediaController.Dispose();
        _sessionManager.Dispose();
        _audioController.Dispose();

        Application.Exit();
    }
}
