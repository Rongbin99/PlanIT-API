# Rate Limit Testing Script for Windows
# Usage: .\test-rate-limits.ps1

param(
    [string]$BaseUrl = "http://localhost:3000",
    [string]$Token = "",
    [int]$TestCount = 60
)

Write-Host "Testing Rate Limits"
Write-Host "Base URL: $BaseUrl"
Write-Host "Test Count: $TestCount"
Write-Host ""

# Check if token is provided
if (-not $Token) {
    Write-Host "JWT token is required. Use -Token parameter."
    Write-Host "Example: .\test-rate-limits.ps1 -Token `"your_jwt_token_here`""
    exit 1
}

# Test 1: Profile endpoint (should hit rate limit)
Write-Host "Testing Profile Endpoint..."
$successCount = 0
$rateLimitedCount = 0

for ($i = 1; $i -le $TestCount; $i++) {
    try {
        $headers = @{
            "Authorization" = "Bearer $Token"
        }
        
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/user/profile" -Headers $headers -Method GET -TimeoutSec 5
        
        if ($response.success) {
            $successCount++
            Write-Host "Request $i - Success"
        }
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 429) {
            $rateLimitedCount++
            Write-Host "Request $i - Rate Limited"
        } else {
            Write-Host "Request $i - Error: $($_.Exception.Message)"
        }
    }
    
    # Small delay to see the progression
    Start-Sleep -Milliseconds 100
}

Write-Host ""
Write-Host "Profile Endpoint Results:"
Write-Host "Successful: $successCount"
Write-Host "Rate Limited: $rateLimitedCount"
Write-Host ""

# Test 2: Login endpoint (should hit rate limit)
Write-Host "Testing Login Endpoint..."
$loginSuccessCount = 0
$loginRateLimitedCount = 0

for ($i = 1; $i -le 15; $i++) {
    try {
        $body = @{
            email = "test@example.com" # change to valid email to test real login request
            password = "wrongpassword" # change to valid password to test real login request
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/user/login" -Body $body -ContentType "application/json" -Method POST -TimeoutSec 5
        
        if ($response.success -eq $false -and $response.error -eq "Invalid Credentials") {
            $loginSuccessCount++
            Write-Host "Login Request $i - Expected failure"
        }
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 429) {
            $loginRateLimitedCount++
            Write-Host "Login Request $i - Rate Limited"
        } elseif ($_.Exception.Response.StatusCode -eq 401) {
            $loginSuccessCount++
            Write-Host "Login Request $i - Expected failure (401)"
        } else {
            Write-Host "Login Request $i - Other error: $($_.Exception.Response.StatusCode)"
        }
    }
    
    Start-Sleep -Milliseconds 100
}

Write-Host ""
Write-Host "Login Endpoint Results:"
Write-Host "Successful (expected failures): $loginSuccessCount"
Write-Host "Rate Limited: $loginRateLimitedCount"
Write-Host ""

# Test 3: Trip listing endpoint (optional auth)
Write-Host "Testing Trip Listing Endpoint..."
$tripSuccessCount = 0
$tripRateLimitedCount = 0

for ($i = 1; $i -le 60; $i++) {
    try {
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/chat" -Method GET -TimeoutSec 5
        
        if ($response.success) {
            $tripSuccessCount++
            Write-Host "Trip Request $i - Success"
        }
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 429) {
            $tripRateLimitedCount++
            Write-Host "Trip Request $i - Rate Limited"
        } else {
            Write-Host "Trip Request $i - Error: $($_.Exception.Message)"
        }
    }
    
    Start-Sleep -Milliseconds 100
}

Write-Host ""
Write-Host "Trip Listing Endpoint Results:"
Write-Host "Successful: $tripSuccessCount"
Write-Host "Rate Limited: $tripRateLimitedCount"
Write-Host ""

Write-Host "Testing Plan Endpoint..."
$planSuccessCount = 0
$planRateLimitedCount = 0

# Create test data for plan request
$planBody = @{
    searchData = @{
        searchQuery = "Test query for rate limit testing"
        filters = @{
            timeOfDay = @("morning")
            environment = "indoor"
            planTransit = $false
            groupSize = "solo"
            planFood = $false
            priceRange = 2
        }
        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    }
    userMessage = "Test message for rate limit testing"
} | ConvertTo-Json -Depth 10

for ($i = 1; $i -le 40; $i++) {
    try {
        $headers = @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $Token"
        }
        
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/plan" -Headers $headers -Body $planBody -Method POST -TimeoutSec 10
        
        if ($response.success) {
            $planSuccessCount++
            Write-Host "Plan Request $i - Success"
        }
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 429) {
            $planRateLimitedCount++
            Write-Host "Plan Request $i - Rate Limited"
        } else {
            Write-Host "Plan Request $i - Error: $($_.Exception.Message)"
        }
    }
    
    Start-Sleep -Milliseconds 100
}

Write-Host ""
Write-Host "Plan Endpoint Results:"
Write-Host "Successful: $planSuccessCount"
Write-Host "Rate Limited: $planRateLimitedCount"
Write-Host ""

Write-Host "Rate Limit Testing Complete!"
Write-Host ""
Write-Host "Summary:"
Write-Host "Profile Endpoint: $successCount success, $rateLimitedCount rate limited"
Write-Host "Login Endpoint: $loginSuccessCount success, $loginRateLimitedCount rate limited"
Write-Host "Trip Listing: $tripSuccessCount success, $tripRateLimitedCount rate limited"
Write-Host "Plan Endpoint: $planSuccessCount success, $planRateLimitedCount rate limited"
Write-Host ""
Write-Host "Expected Rate Limits:"
Write-Host "Profile: 30 requests/15min"
Write-Host "Login: 10 requests/15min"
Write-Host "Trip Listing: 50 requests/15min"
Write-Host "Plan: 30 requests/15min" 
