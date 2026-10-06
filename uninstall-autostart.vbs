Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

startupFolder = WshShell.SpecialFolders("Startup")
shortcutPath = startupFolder & "\ProChatServer.lnk"

If fso.FileExists(shortcutPath) Then
    fso.DeleteFile shortcutPath
    MsgBox "ProChat Auto-Start has been removed from Windows Startup.", vbInformation, "ProChat Uninstall AutoStart"
Else
    MsgBox "ProChat Auto-Start shortcut was not found in Startup folder.", vbExclamation, "ProChat Uninstall AutoStart"
End If
