using System;
using System.Threading;
using System.Windows.Forms;

namespace Remotva.Companion;

static class Program
{
    private const string AppMutexName = "Global\\RemotvaCompanion_SingleInstance_Mutex";

    [STAThread]
    static void Main(string[] args)
    {
        using var mutex = new Mutex(true, AppMutexName, out bool createdNew);
        if (!createdNew)
        {
            MessageBox.Show("Remotva Companion is already running in the system tray.", "Remotva", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new AppContext(args));
    }    
}