param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$ManagedIdentityClientId,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string]$ManagedIdentityPrincipalId,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[^@\s]+@[^@\s]+$')]
    [string]$MailboxAddress,

    [switch]$SkipConnection
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command Connect-ExchangeOnline -ErrorAction SilentlyContinue)) {
    throw 'Install ExchangeOnlineManagement first: Install-PSResource ExchangeOnlineManagement -Scope CurrentUser -TrustRepository'
}

if (-not $SkipConnection) { Connect-ExchangeOnline -Device }
$scopeName = "FacturasCopilot-$($MailboxAddress.Split('@')[0])-Only"
$existingPointer = Get-ServicePrincipal -Identity $ManagedIdentityPrincipalId -ErrorAction SilentlyContinue
if (-not $existingPointer) {
    New-ServicePrincipal -AppId $ManagedIdentityClientId -ObjectId $ManagedIdentityPrincipalId -DisplayName 'Facturas Copilot Function - Dev' | Out-Null
}

# The matching address is exact; no other mailbox can be in the resulting scope.
$scope = Get-ManagementScope -Identity $scopeName -ErrorAction SilentlyContinue
if (-not $scope) {
    New-ManagementScope -Name $scopeName -RecipientRestrictionFilter "PrimarySmtpAddress -eq '$MailboxAddress'" | Out-Null
}

$assignmentName = "FacturasCopilot-MailRead-$($MailboxAddress.Split('@')[0])"
$assignment = Get-ManagementRoleAssignment -Identity $assignmentName -ErrorAction SilentlyContinue
if (-not $assignment) {
    New-ManagementRoleAssignment -Name $assignmentName -App $ManagedIdentityPrincipalId -Role 'Application Mail.Read' -CustomResourceScope $scopeName | Out-Null
}

Test-ServicePrincipalAuthorization -Identity $ManagedIdentityPrincipalId -Resource $MailboxAddress | Format-Table RoleName,GrantedPermissions,AllowedResourceScope,InScope

# Do not grant Mail.Read through Entra ID. Application RBAC is the only Mail.Read grant.
