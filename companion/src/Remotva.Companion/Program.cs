using System;
using System.Threading;
using System.Windows.Forms;

namespace Remotva.Companion;

static class Program
{
    private const string AppMutexName = "Local\\RemotvaCompanion_SingleInstance_Mutex";

    [STAThread]
    static void Main(string[] args)
    {
        string logPath = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "startup_log.txt");
        try
        {
            System.IO.File.AppendAllText(logPath, $"[{DateTime.UtcNow:O}] Starting Remotva Companion with args: {string.Join(" ", args)}\n");

            Mutex? mutex = null;
            bool createdNew = true;

            try
            {
                mutex = new Mutex(true, AppMutexName, out createdNew);
            }
            catch (Exception ex)
            {
                System.IO.File.AppendAllText(logPath, $"[{DateTime.UtcNow:O}] Mutex exception: {ex}\n");
                createdNew = true;
            }

            if (!createdNew)
            {
                System.IO.File.AppendAllText(logPath, $"[{DateTime.UtcNow:O}] Another instance is already running.\n");
                MessageBox.Show("Remotva Companion is already running in the system tray.", "Remotva", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            ApplicationConfiguration.Initialize();
            System.IO.File.AppendAllText(logPath, $"[{DateTime.UtcNow:O}] ApplicationConfiguration initialized. Running AppContext...\n");
            Application.Run(new AppContext(args));

            mutex?.Dispose();
            System.IO.File.AppendAllText(logPath, $"[{DateTime.UtcNow:O}] Application exited normally.\n");
        }
        catch (Exception fatal)
        {
            System.IO.File.AppendAllText(logPath, $"[{DateTime.UtcNow:O}] FATAL EXCEPTION: {fatal}\n");
            MessageBox.Show($"Startup Error: {fatal.Message}\n\nCheck {logPath} for details.", "Remotva Fatal Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }    
}