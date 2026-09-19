# setup-firewall.ps1 — Windows Firewall rule configuration for Remotva
# Enforces windows-audio-remote-spec.md Section 3:
# "Port 8377 inbound rule, Private and Domain profiles only. Not Public."

param (
    [switch]$Remove
)

$RuleName = "Remotva Audio Remote"
$Port = 8377

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $IsAdmin) {
    Write-Warning "Administrative privileges required to modify Windows Firewall rules. Please run as Administrator or through the installer."
    exit 0
}

if ($Remove) {
    Write-Host "Removing Windows Firewall rule for $RuleName..."
    Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
    Write-Host "Firewall rule removed."
} else {
    Write-Host "Configuring Windows Firewall rule for $RuleName (TCP Port $Port, Private & Domain profiles)..."
    
    # Remove existing rule if present
    Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue

    # Add Inbound rule for Private and Domain profiles only
    New-NetFirewallRule `
        -DisplayName $RuleName `
        -Direction Inbound `
        -LocalPort $Port `
        -Protocol TCP `
        -Action Allow `
        -Profile Private, Domain `
        -Description "Inbound TCP rule for Remotva Windows Audio Remote phone connectivity."

    Write-Host "Firewall rule created successfully."
}
