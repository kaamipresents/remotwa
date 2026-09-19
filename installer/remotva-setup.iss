; Inno Setup Script for Remotva Windows Companion
; Implements windows-audio-remote-spec.md Section 3 & Milestone 6

#define MyAppName "Remotva"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Remotva"
#define MyAppURL "https://github.com/remotva/remotva"
#define MyAppExeName "Remotva.Companion.exe"

[Setup]
AppId={{C789643B-F102-4A73-A5B2-793E94E51083}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\dist
OutputBaseFilename=RemotvaCompanion-Setup-{#MyAppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startupentry"; Description: "Start Remotva automatically when Windows starts"; GroupDescription: "Startup Options:"

[Files]
Source: "..\companion\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "setup-firewall.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Run on Windows startup if selected
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "RemotvaCompanion"; ValueData: """{app}\{#MyAppExeName}"""; Tasks: startupentry; Flags: uninsdeletevalue

[Run]
; Configure Windows Firewall rule for port 8377 (Private and Domain profiles only)
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\setup-firewall.ps1"""; Flags: runhidden waituntilterminated; StatusMsg: "Configuring Windows Firewall rules for port 8377..."
; Launch companion after installation finishes
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Remove Windows Firewall rule upon uninstallation
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\setup-firewall.ps1"" -Remove"; Flags: runhidden waituntilterminated

[Code]
// Check for .NET 8 Runtime presence before installation
function InitializeSetup(): Boolean;
var
  Net8Installed: Boolean;
  ResultCode: Integer;
begin
  Net8Installed := Exec('powershell.exe', '-NoProfile -Command "if (dotnet --list-runtimes | Select-String ''Microsoft.WindowsDesktop.App 8\.'') { exit 0 } else { exit 1 }"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
  
  if not Net8Installed then
  begin
    if MsgBox('Remotva Companion requires the .NET 8 Desktop Runtime.' + #13#10 + 'Would you like to visit the .NET download page now?', mbConfirmation, MB_YESNO) = IDYES then
    begin
      ShellExec('open', 'https://dotnet.microsoft.com/download/dotnet/8.0', '', '', SW_SHOWNORMAL, ewNoWait, ResultCode);
    end;
  end;
  Result := True;
end;
