using System;
using System.Drawing;
using System.Text.Json;
using System.Windows.Forms;
using QRCoder;
using Remotva.Companion.Security;

namespace Remotva.Companion.UI;

public class PairingForm : Form
{
    private readonly PairingManager _pairingManager;
    private readonly int _port;
    private PairingSession? _currentSession;
    private readonly System.Windows.Forms.Timer _countdownTimer;
    private Label _pinLabel = null!;
    private Label _timerLabel = null!;
    private PictureBox _qrPictureBox = null!;

    public PairingForm(PairingManager pairingManager, int port)
    {
        _pairingManager = pairingManager;
        _port = port;

        _countdownTimer = new System.Windows.Forms.Timer();
        _countdownTimer.Interval = 1000;
        _countdownTimer.Tick += CountdownTimer_Tick;

        InitializeComponents();
        StartPairing();
    }

    private void InitializeComponents()
    {
        Text = "Remotva — Pair New Device";
        Size = new Size(380, 520);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterScreen;
        ShowInTaskbar = true;
        TopMost = true;
        MaximizeBox = false;
        MinimizeBox = false;
        BackColor = Color.FromArgb(24, 24, 27);
        ForeColor = Color.White;

        var titleLabel = new Label
        {
            Text = "Scan QR Code or Enter PIN",
            Font = new Font("Segoe UI", 13, FontStyle.Bold),
            ForeColor = Color.White,
            TextAlign = ContentAlignment.MiddleCenter,
            Dock = DockStyle.Top,
            Height = 45
        };

        _qrPictureBox = new PictureBox
        {
            Size = new Size(240, 240),
            Location = new Point(62, 55),
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle
        };

        _pinLabel = new Label
        {
            Text = "------",
            Font = new Font("Segoe UI", 28, FontStyle.Bold),
            ForeColor = Color.FromArgb(59, 130, 246),
            TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point(20, 310),
            Size = new Size(324, 50)
        };

        _timerLabel = new Label
        {
            Text = "PIN expires in 120s",
            Font = new Font("Segoe UI", 10),
            ForeColor = Color.FromArgb(161, 161, 170),
            TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point(20, 365),
            Size = new Size(324, 25)
        };

        var doneButton = new Button
        {
            Text = "Cancel",
            DialogResult = DialogResult.Cancel,
            Size = new Size(120, 38),
            Location = new Point(122, 410),
            FlatStyle = FlatStyle.Flat,
            ForeColor = Color.White,
            BackColor = Color.FromArgb(39, 39, 42),
            Font = new Font("Segoe UI", 10, FontStyle.Regular)
        };
        doneButton.FlatAppearance.BorderColor = Color.FromArgb(63, 63, 70);
        doneButton.Click += (s, e) => Close();

        Controls.Add(titleLabel);
        Controls.Add(_qrPictureBox);
        Controls.Add(_pinLabel);
        Controls.Add(_timerLabel);
        Controls.Add(doneButton);

        FormClosing += (s, e) =>
        {
            _countdownTimer.Stop();
            _pairingManager.CancelSession();
        };
    }

    private void StartPairing()
    {
        _currentSession = _pairingManager.StartNewSession();
        _pinLabel.Text = _currentSession.Pin;

        string lanIp = DeviceIdentity.GetLocalLanIp()?.ToString() ?? "127.0.0.1";
        var qrData = new
        {
            ip = lanIp,
            port = _port,
            pin = _currentSession.Pin,
            id = DeviceIdentity.GetDeviceId(),
            name = Environment.MachineName
        };
        string qrJson = JsonSerializer.Serialize(qrData);

        using var qrGenerator = new QRCodeGenerator();
        using var qrCodeData = qrGenerator.CreateQrCode(qrJson, QRCodeGenerator.ECCLevel.Q);
        using var qrCode = new QRCode(qrCodeData);
        _qrPictureBox.Image = qrCode.GetGraphic(20, Color.Black, Color.White, true);

        _countdownTimer.Start();
        UpdateTimerDisplay();
    }

    private void CountdownTimer_Tick(object? sender, EventArgs e)
    {
        if (_currentSession == null || !_currentSession.IsActive)
        {
            _countdownTimer.Stop();
            _pinLabel.Text = "EXPIRED";
            _pinLabel.ForeColor = Color.FromArgb(239, 68, 68);
            _timerLabel.Text = "Pairing session timed out. Please reopen.";
            return;
        }

        UpdateTimerDisplay();
    }

    private void UpdateTimerDisplay()
    {
        if (_currentSession == null) return;
        int remaining = (int)Math.Max(0, (_currentSession.ExpiresAt - DateTime.UtcNow).TotalSeconds);
        _timerLabel.Text = $"PIN expires in {remaining}s";
    }
}
