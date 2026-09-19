using System;
using System.Drawing;
using System.Windows.Forms;
using Remotva.Companion.Security;

namespace Remotva.Companion.UI;

public class SettingsForm : Form
{
    private readonly TokenStore _tokenStore;
    private readonly int _port;
    private ListView _deviceListView = null!;

    public SettingsForm(TokenStore tokenStore, int port)
    {
        _tokenStore = tokenStore;
        _port = port;

        InitializeComponents();
        LoadDevices();
    }

    private void InitializeComponents()
    {
        Text = "Remotva — Settings & Paired Devices";
        Size = new Size(520, 420);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterScreen;
        MaximizeBox = false;
        MinimizeBox = false;
        BackColor = Color.FromArgb(24, 24, 27);
        ForeColor = Color.White;

        string lanIp = DeviceIdentity.GetLocalLanIp()?.ToString() ?? "127.0.0.1";
        string deviceId = DeviceIdentity.GetDeviceId();

        var infoLabel = new Label
        {
            Text = $"PC Name: {Environment.MachineName}  |  IP: {lanIp}:{_port}\nDevice ID: {deviceId}",
            Font = new Font("Segoe UI", 9.5f),
            ForeColor = Color.FromArgb(212, 212, 216),
            Location = new Point(20, 15),
            Size = new Size(464, 40)
        };

        var titleLabel = new Label
        {
            Text = "Paired Devices",
            Font = new Font("Segoe UI", 11, FontStyle.Bold),
            ForeColor = Color.White,
            Location = new Point(20, 65),
            Size = new Size(200, 25)
        };

        _deviceListView = new ListView
        {
            Location = new Point(20, 95),
            Size = new Size(464, 210),
            View = View.Details,
            FullRowSelect = true,
            BackColor = Color.FromArgb(39, 39, 42),
            ForeColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle,
            Font = new Font("Segoe UI", 9.5f)
        };

        _deviceListView.Columns.Add("Client Name", 150);
        _deviceListView.Columns.Add("Paired Date", 140);
        _deviceListView.Columns.Add("Last Active", 140);

        var revokeButton = new Button
        {
            Text = "Revoke Selected",
            Size = new Size(140, 35),
            Location = new Point(20, 320),
            FlatStyle = FlatStyle.Flat,
            ForeColor = Color.White,
            BackColor = Color.FromArgb(185, 28, 28),
            Font = new Font("Segoe UI", 9.5f)
        };
        revokeButton.FlatAppearance.BorderColor = Color.FromArgb(220, 38, 38);
        revokeButton.Click += RevokeButton_Click;

        var closeButton = new Button
        {
            Text = "Close",
            Size = new Size(100, 35),
            Location = new Point(384, 320),
            FlatStyle = FlatStyle.Flat,
            ForeColor = Color.White,
            BackColor = Color.FromArgb(63, 63, 70),
            Font = new Font("Segoe UI", 9.5f)
        };
        closeButton.FlatAppearance.BorderColor = Color.FromArgb(82, 82, 91);
        closeButton.Click += (s, e) => Close();

        Controls.Add(infoLabel);
        Controls.Add(titleLabel);
        Controls.Add(_deviceListView);
        Controls.Add(revokeButton);
        Controls.Add(closeButton);
    }

    private void LoadDevices()
    {
        _deviceListView.Items.Clear();
        var devices = _tokenStore.GetAll();

        foreach (var dev in devices)
        {
            var item = new ListViewItem(dev.ClientName) { Tag = dev.Token };
            item.SubItems.Add(dev.CreatedAt.ToLocalTime().ToString("g"));
            item.SubItems.Add(dev.LastUsedAt.ToLocalTime().ToString("g"));
            _deviceListView.Items.Add(item);
        }
    }

    private void RevokeButton_Click(object? sender, EventArgs e)
    {
        if (_deviceListView.SelectedItems.Count == 0)
        {
            MessageBox.Show("Please select a device to revoke.", "Remotva", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var selected = _deviceListView.SelectedItems[0];
        string? token = selected.Tag as string;
        if (!string.IsNullOrEmpty(token))
        {
            if (MessageBox.Show($"Revoke access for '{selected.Text}'?", "Confirm Revocation", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes)
            {
                _tokenStore.RevokeToken(token);
                LoadDevices();
            }
        }
    }
}
