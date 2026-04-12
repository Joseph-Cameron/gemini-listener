' Lovense PoC — Full silent launcher (all services)
' Starts: Dispatcher, Listener, Cloudflare Tunnel, Gemini Bridge
' Used by the Windows Startup shortcut for auto-start on boot.

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
strPath = FSO.GetParentFolderName(WScript.ScriptFullName)

' Set Gemini API key for the bridge
WshShell.Environment("Process")("GEMINI_API_KEY") = "AIzaSyCFyVfVyClZZjwrfTdJgq4HfACf2xy6-P0"

' 1. Start Dispatcher (hidden)
WshShell.Run "cmd /c cd /d """ & strPath & "\web-dispatcher"" && node server.js", 0, False

' Wait for dispatcher to bind port
WScript.Sleep 3000

' 2. Start Listener (hidden)
WshShell.Run "cmd /c cd /d """ & strPath & "\local-listener"" && node listener.js", 0, False

' Wait for listener to connect
WScript.Sleep 2000

' 3. Start Cloudflare Tunnel (hidden)
If FSO.FileExists(strPath & "\cloudflared.exe") Then
    WshShell.Run "cmd /c cd /d """ & strPath & """ && cloudflared.exe tunnel --url http://localhost:3000", 0, False
End If

' Wait for tunnel to establish
WScript.Sleep 3000

' 4. Start Gemini Bridge (hidden)
WshShell.Run "cmd /c cd /d """ & strPath & "\gemini-bridge"" && node bridge.js", 0, False
