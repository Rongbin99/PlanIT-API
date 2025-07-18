# Get JWT Token Script for Windows
# Usage: .\get-token.ps1

param(
    [string]$BaseUrl = "http://localhost:3000",
    [string]$Email = "",
    [string]$Password = ""
)

Write-Host "Getting JWT Token"
Write-Host "Base URL: $BaseUrl"
Write-Host ""

# Prompt for credentials if not provided
if (-not $Email) {
    $Email = Read-Host "Enter your email"
}

if (-not $Password) {
    $SecurePassword = Read-Host "Enter your password" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
    $Password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

Write-Host "Attempting login..."

try {
    $body = @{
        email = $Email
        password = $Password
    } | ConvertTo-Json
    
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/user/login" -Body $body -ContentType "application/json" -Method POST -TimeoutSec 10
    
    if ($response.success) {
        Write-Host "Login successful!"
        Write-Host ""
        Write-Host "Your JWT Token:"
        Write-Host $response.token
        Write-Host ""
        Write-Host "Copy this token and use it in your rate limit tests:"
        Write-Host ".\test-rate-limits.ps1 -Token `"$($response.token)`""
        Write-Host ""
        Write-Host "User Info:"
        Write-Host "Name: $($response.user.name)"
        Write-Host "Email: $($response.user.email)"
        Write-Host "User ID: $($response.user.id)"
    } else {
        Write-Host "Login failed: $($response.message)"
    }
}
catch {
    Write-Host "Error during login: $($_.Exception.Message)"
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode
        Write-Host "Status Code: $statusCode"
        
        if ($statusCode -eq 401) {
            Write-Host "Invalid email or password"
        } elseif ($statusCode -eq 429) {
            Write-Host "Rate limited - too many login attempts"
        }
    }
} 
