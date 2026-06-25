param([long]$hwnd = 0)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class GlobalKeyboardHook {
    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
    private static LowLevelKeyboardProc _proc = HookCallback;
    private static IntPtr _hookID = IntPtr.Zero;
    private static bool _running = true;
    private static readonly IntPtr _stdout = GetStdHandle(-11);
    private static IntPtr _targetHwnd = IntPtr.Zero;

    public static void SetTargetHwnd(long hwnd) {
        _targetHwnd = (IntPtr)hwnd;
    }

    public static void Run() {
        Console.CancelKeyPress += (s, e) => { e.Cancel = true; Stop(); };
        using (var p = System.Diagnostics.Process.GetCurrentProcess())
        using (var m = p.MainModule) {
            _hookID = SetWindowsHookEx(13, _proc, GetModuleHandle(m.ModuleName), 0);
        }
        WriteOut("HOOK_READY\n");
        MSG msg;
        while (_running && GetMessage(out msg, IntPtr.Zero, 0, 0)) {
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }
        if (_hookID != IntPtr.Zero) UnhookWindowsHookEx(_hookID);
    }

    public static void Stop() { _running = false; }

    private static void WriteOut(string s) {
        byte[] b = System.Text.Encoding.UTF8.GetBytes(s);
        uint w = 0;
        WriteFile(_stdout, b, (uint)b.Length, out w, IntPtr.Zero);
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0 && (int)wParam == 0x0100) {
            int vk = Marshal.ReadInt32(lParam);
            IntPtr fg = GetForegroundWindow();
            bool isTarget = _targetHwnd != IntPtr.Zero && fg == _targetHwnd;

            if (!isTarget) {
                WriteOut(vk + "\n");
                return (IntPtr)1;
            }
        }
        return CallNextHookEx(_hookID, nCode, wParam, lParam);
    }

    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hhk);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll", CharSet = CharSet.Auto)] static extern IntPtr GetModuleHandle(string lpModuleName);
    [DllImport("user32.dll")] static extern bool GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG lpMsg);
    [DllImport("user32.dll")] static extern bool DispatchMessage(ref MSG lpMsg);
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int nStdHandle);
    [DllImport("kernel32.dll")] static extern bool WriteFile(IntPtr hFile, byte[] lpBuffer, uint nNumberOfBytesToWrite, out uint lpNumberOfBytesWritten, IntPtr lpOverlapped);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();

    [StructLayout(LayoutKind.Sequential)]
    public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int pt_x; public int pt_y; }
}
"@

[GlobalKeyboardHook]::SetTargetHwnd($hwnd)
[GlobalKeyboardHook]::Run()
