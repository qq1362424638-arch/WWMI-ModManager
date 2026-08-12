using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class Launcher
{
    private const string AppExe = "WWMI-ModManager.exe";

    [STAThread]
    private static int Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string appPath = Path.Combine(root, "dist", "win-unpacked", AppExe);

        if (!File.Exists(appPath))
        {
            MessageBox.Show(
                "未找到程序文件：\n" + appPath + "\n\n请先运行 npm run dist:win 生成 dist/win-unpacked。",
                "WWMI Mod Manager",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = appPath,
            WorkingDirectory = Path.GetDirectoryName(appPath),
            UseShellExecute = false
        });
        return 0;
    }
}
