Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
backendDir = scriptDir & "\backend"

WshShell.CurrentDirectory = backendDir
WshShell.Run "cmd.exe /c start /b node server.js", 0, False
