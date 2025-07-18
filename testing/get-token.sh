#!/bin/bash

# Get JWT Token Script for macOS/Linux
# Usage: ./get-token.sh

# Default values
BASE_URL="http://localhost:3000"
EMAIL=""
PASSWORD=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}Getting JWT Token${NC}"
    echo -e "${YELLOW}Base URL: $BASE_URL${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${CYAN}📋 $1${NC}"
}

print_user_info() {
    echo -e "${YELLOW}User Info:${NC}"
    echo -e "${WHITE}Name: $1${NC}"
    echo -e "${WHITE}Email: $2${NC}"
    echo -e "${WHITE}User ID: $3${NC}"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--url)
            BASE_URL="$2"
            shift 2
            ;;
        -e|--email)
            EMAIL="$2"
            shift 2
            ;;
        -p|--password)
            PASSWORD="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  -u, --url URL        Base URL (default: http://localhost:3000)"
            echo "  -e, --email EMAIL    Email address"
            echo "  -p, --password PASS  Password"
            echo "  -h, --help           Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

print_status

# Prompt for credentials if not provided
if [ -z "$EMAIL" ]; then
    echo -n "Enter your email: "
    read -r EMAIL
fi

if [ -z "$PASSWORD" ]; then
    echo -n "Enter your password: "
    read -rs PASSWORD
    echo ""
fi

echo -e "${CYAN}Attempting login...${NC}"

# Create temporary JSON file for request body
TEMP_FILE=$(mktemp)
cat > "$TEMP_FILE" << EOF
{
    "email": "$EMAIL",
    "password": "$PASSWORD"
}
EOF

# Make the login request
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d @"$TEMP_FILE" \
    "$BASE_URL/api/user/login")

# Clean up temporary file
rm "$TEMP_FILE"

# Extract response body and status code
RESPONSE_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_STATUS=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_STATUS" -eq 200 ]; then
    # Parse JSON response
    SUCCESS=$(echo "$RESPONSE_BODY" | grep -o '"success":[^,]*' | cut -d':' -f2 | tr -d ' ')
    TOKEN=$(echo "$RESPONSE_BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    USER_NAME=$(echo "$RESPONSE_BODY" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
    USER_EMAIL=$(echo "$RESPONSE_BODY" | grep -o '"email":"[^"]*"' | cut -d'"' -f4)
    USER_ID=$(echo "$RESPONSE_BODY" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    
    if [ "$SUCCESS" = "true" ] && [ -n "$TOKEN" ]; then
        print_success "Login successful!"
        echo ""
        echo -e "${YELLOW}Your JWT Token:${NC}"
        echo -e "${WHITE}$TOKEN${NC}"
        echo ""
        print_info "Copy this token and use it in your rate limit tests:"
        echo -e "${WHITE}./test-rate-limits.sh -t \"$TOKEN\"${NC}"
        echo ""
        print_user_info "$USER_NAME" "$USER_EMAIL" "$USER_ID"
    else
        print_error "Login failed: Invalid response format"
        echo "Response: $RESPONSE_BODY"
    fi
else
    case $HTTP_STATUS in
        401)
            print_error "Invalid email or password"
            ;;
        429)
            print_error "Rate limited - too many login attempts"
            ;;
        500)
            print_error "Server error - check if API is running"
            ;;
        *)
            print_error "Login failed with status code: $HTTP_STATUS"
            echo "Response: $RESPONSE_BODY"
            ;;
    esac
fi 
