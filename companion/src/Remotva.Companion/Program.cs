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
        Mutex? mutex = null;
        bool createdNew = true;

        try
        {
            mutex = new Mutex(true, AppMutexName, out createdNew);
        }
        catch
        {
            createdNew = true;
        }

        if (!createdNew)
        {
            MessageBox.Show("Remotva Companion is already running in the system tray.", "Remotva", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new AppContext(args));

        mutex?.Dispose();
    }    
}