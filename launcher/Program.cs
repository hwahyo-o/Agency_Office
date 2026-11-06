using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Windows.Forms;

namespace AiTeamOffice;

internal static class Program
{
    private const string Address = "http://127.0.0.1:1455/";
    private static Process? server;
    private static NotifyIcon? tray;
    private static readonly HttpClient client = new() { Timeout = TimeSpan.FromSeconds(2) };

    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        var root = AppContext.BaseDirectory;
        var node = Path.Combine(root, "runtime", "node.exe");
        var script = Path.Combine(root, "office", "server.mjs");
        if (!File.Exists(node) || !File.Exists(script))
        {
            MessageBox.Show("앱 파일이 올바르게 압축 해제되지 않았습니다. ZIP 전체를 다시 풀어 주세요.", "AI 팀 오피스", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        try
        {
            var logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AI-Team-Office", "logs");
            Directory.CreateDirectory(logDir);
            var start = new ProcessStartInfo(node)
            {
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            start.ArgumentList.Add(script);
            server = new Process { StartInfo = start, EnableRaisingEvents = true };
            server.OutputDataReceived += (_, e) => { if (e.Data is not null) File.AppendAllText(Path.Combine(logDir, "server.log"), e.Data + Environment.NewLine); };
            server.ErrorDataReceived += (_, e) => { if (e.Data is not null) File.AppendAllText(Path.Combine(logDir, "server.log"), e.Data + Environment.NewLine); };
            server.Start();
            server.BeginOutputReadLine();
            server.BeginErrorReadLine();
        }
        catch (Exception ex)
        {
            MessageBox.Show("앱 서버를 시작하지 못했습니다.\n" + ex.Message, "AI 팀 오피스", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        var menu = new ContextMenuStrip();
        menu.Items.Add("오피스 열기", null, (_, _) => OpenOffice());
        menu.Items.Add("앱 종료", null, (_, _) => ExitOffice());
        tray = new NotifyIcon
        {
            Icon = System.Drawing.SystemIcons.Application,
            Text = "AI 팀 오피스",
            ContextMenuStrip = menu,
            Visible = true
        };
        tray.DoubleClick += (_, _) => OpenOffice();
        _ = StartAndOpenAsync();
        Application.Run();
        tray.Visible = false;
        tray.Dispose();
        server?.Dispose();
    }

    private static async Task StartAndOpenAsync()
    {
        for (var i = 0; i < 100; i++)
        {
            if (server is null || server.HasExited)
            {
                MessageBox.Show("앱 서버가 시작 중 종료되었습니다. 로그: %LOCALAPPDATA%\\AI-Team-Office\\logs\\server.log", "AI 팀 오피스", MessageBoxButtons.OK, MessageBoxIcon.Error);
                ExitOffice();
                return;
            }
            try
            {
                using var response = await client.GetAsync(Address);
                if (response.StatusCode == HttpStatusCode.OK)
                {
                    OpenOffice();
                    tray?.ShowBalloonTip(2500, "AI 팀 오피스 실행 중", "작업 표시줄 알림 영역 아이콘에서 열기 또는 종료할 수 있습니다.", ToolTipIcon.Info);
                    return;
                }
            }
            catch (HttpRequestException) { }
            catch (TaskCanceledException) { }
            await Task.Delay(250);
        }
        MessageBox.Show("앱 서버 준비 시간이 초과되었습니다. 잠시 후 다시 실행해 주세요.", "AI 팀 오피스", MessageBoxButtons.OK, MessageBoxIcon.Error);
        ExitOffice();
    }

    private static void OpenOffice()
    {
        try { Process.Start(new ProcessStartInfo(Address) { UseShellExecute = true }); }
        catch (Exception ex) { MessageBox.Show("브라우저를 열지 못했습니다. " + ex.Message, "AI 팀 오피스", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    private static void ExitOffice()
    {
        try { client.PostAsync(Address + "api/quit", new StringContent("{}", System.Text.Encoding.UTF8, "application/json")).GetAwaiter().GetResult(); } catch { }
        try { if (server is { HasExited: false }) server.Kill(true); } catch { }
        Application.Exit();
    }
}
