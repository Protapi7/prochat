Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

rootDir = fso.GetParentFolderName(WScript.ScriptFullName)
vbsTarget = rootDir & "\start-server-silent.vbs"
startupFolder = WshShell.SpecialFolders("Startup")
shortcutPath = startupFolder & "\ProChatServer.lnk"

Set shortcut = WshShell.CreateShortcut(shortcutPath)
shortcut.TargetPath = "wscript.exe"
shortcut.Arguments = """" & vbsTarget & """"
shortcut.WorkingDirectory = rootDir
shortcut.Description = "ProChat Silent AutoStart Server"
shortcut.Save

' Start the server right now if not running
WshShell.Run "wscript.exe """ & vbsTarget & """", 0, False

MsgBox "ProChat Auto-Start Installed Successfully!" & vbCrLf & vbCrLf & "1. The local server is now running silently in the background." & vbCrLf & "2. It will automatically start every time you turn on your PC." & vbCrLf & "3. No need to keep Antigravity or VS Code open!", vbInformation, "ProChat Fulltime Setup"
