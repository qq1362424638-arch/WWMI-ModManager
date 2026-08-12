Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "D:\WWMI-ModManager"
shell.Run """D:\Program Files\nodejs\npm.cmd"" start", 0, False
