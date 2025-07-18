# Testing Script Steps
This quick guide is to walk you through how to use the Powershell (.ps1) and Bash Script (.sh) testing scripts to test the rate limits.

## Prerequisites
- Your API server running on `http://localhost:3000` (see [this README](https://github.com/Rongbin99/PlanIT-API/blob/main/README.md))
- Valid user account credentials
- PowerShell (Windows) or Bash (macOS/Linux)

> [!TIP]
> For macOS, run `chmod +x *.sh` before proceeding!

## Obtain your JWT
Quickly enter your email and password to obtain the JWT associated with your USER_ID

Windows (PowerShell):

```powershell
.\get-token.ps1
```

macOS/Linux (Bash):

```bash
./get-token.sh
```

## Execute the Rate Limit Test Scripts
Using your JWT from above, run the rate limit testing scripts

Windows (PowerShell):

```powershell
.\test-rate-limits.ps1 -Token "YOUR_JWT_TOKEN_HERE"
```

macOS/Linux (Bash):

```bash
./test-rate-limits.sh -t "YOUR_JWT_TOKEN_HERE"
```

## Expected Results

### Successful Rate Limiting
Upon success, you should see:
- `200 OK` status for requests within the limit
- `429 Too Many Requests` once the rate limit has been hit

> [!NOTE]
> `Expected failure (401)` is expected. If you want to test for a login request with legitimate credentials, modify the `test-rate-limits` script email and password field.

### Rate Limit Thresholds
- **Profile Endpoint**: 30 requests per 15 minutes
- **Login Endpoint**: 10 requests per 15 minutes
- **Signup Endpoint**: 5 requests per 15 minutes
- **Password Change**: 5 requests per 15 minutes
- **Profile Image Upload**: 5 requests per 15 minutes
- **Trip Listing**: 50 requests per 15 minutes
- **Trip Retrieval**: 100 requests per 15 minutes
- **Trip Deletion**: 20 requests per 15 minutes
- **Audit Logs**: 20 requests per 15 minutes
- **Status Endpoints**: 100 requests per 15 minutes

## Manual Testing

### Quick Test with curl
```bash
# Test single request
curl -H "Authorization: Bearer [YOUR_JWT_TOKEN]" http://localhost:3000/api/user/profile

# Spam requests to hit limit
for i in {1..40}; do
  curl -H "Authorization: Bearer [YOUR_JWT_TOKEN]" http://localhost:3000/api/user/profile
  echo "Request $i"
done
```

## Troubleshooting

### Common Issues
1. **Connection refused**: Make sure your API server is running
2. **Invalid token**: Get a fresh JWT token using the get-token script
3. **Rate limit not working**: Check server logs for rate limit messages
4. **Script permission denied**: Make scripts executable with `chmod +x *.sh` (macOS/Linux)

### Reset Rate Limits
Rate limits reset after 15 minutes. To test immediately:
- Restart your API server
- Wait 15 minutes for automatic reset
- Use a different IP address
