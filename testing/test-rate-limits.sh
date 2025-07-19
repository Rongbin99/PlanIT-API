#!/bin/bash

# Rate Limit Testing Script for macOS/Linux
# Usage: ./test-rate-limits.sh

# Default values
BASE_URL="http://localhost:3000"
TOKEN=""
TEST_COUNT=60

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Function to print colored output
print_header() {
    echo -e "${GREEN}Testing Rate Limits${NC}"
    echo -e "${YELLOW}Base URL: $BASE_URL${NC}"
    echo -e "${YELLOW}Test Count: $TEST_COUNT${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_info() {
    echo -e "${CYAN}📊 $1${NC}"
}

print_results() {
    echo -e "${MAGENTA}📈 $1${NC}"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--url)
            BASE_URL="$2"
            shift 2
            ;;
        -t|--token)
            TOKEN="$2"
            shift 2
            ;;
        -c|--count)
            TEST_COUNT="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  -u, --url URL        Base URL (default: http://localhost:3000)"
            echo "  -t, --token TOKEN    JWT token for authentication"
            echo "  -c, --count COUNT    Number of requests to test (default: 60)"
            echo "  -h, --help           Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

print_header

# Check if token is provided
if [ -z "$TOKEN" ]; then
    print_error "JWT token is required. Use -t or --token option."
    echo "Example: $0 -t \"your_jwt_token_here\""
    exit 1
fi

# Test 1: Profile endpoint (should hit rate limit)
print_info "Testing Profile Endpoint..."
success_count=0
rate_limited_count=0

for ((i=1; i<=TEST_COUNT; i++)); do
    # Make the request
    RESPONSE=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer $TOKEN" \
        "$BASE_URL/api/user/profile")
    
    # Extract response body and status code
    RESPONSE_BODY=$(echo "$RESPONSE" | head -n -1)
    HTTP_STATUS=$(echo "$RESPONSE" | tail -n 1)
    
    if [ "$HTTP_STATUS" -eq 200 ]; then
        ((success_count++))
        print_success "Request $i - Success"
    elif [ "$HTTP_STATUS" -eq 429 ]; then
        ((rate_limited_count++))
        print_error "Request $i - Rate Limited"
    else
        print_warning "Request $i - HTTP $HTTP_STATUS"
    fi
    
    # Small delay to see the progression
    sleep 0.1
done

echo ""
print_results "Profile Endpoint Results:"
echo -e "${WHITE}Successful: $success_count${NC}"
echo -e "${WHITE}Rate Limited: $rate_limited_count${NC}"
echo ""

# Test 2: Login endpoint (should hit rate limit)
print_info "Testing Login Endpoint..."
login_success_count=0
login_rate_limited_count=0

# Create temporary JSON file for login request
TEMP_FILE=$(mktemp)
cat > "$TEMP_FILE" << EOF
{
    "email": "test@example.com",
    "password": "wrongpassword"
}
EOF

for ((i=1; i<=15; i++)); do
    # Make the login request
    RESPONSE=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d @"$TEMP_FILE" \
        "$BASE_URL/api/user/login")
    
    # Extract response body and status code
    RESPONSE_BODY=$(echo "$RESPONSE" | head -n -1)
    HTTP_STATUS=$(echo "$RESPONSE" | tail -n 1)
    
    if [ "$HTTP_STATUS" -eq 401 ]; then
        ((login_success_count++))
        print_success "Login Request $i - Expected failure (401)"
    elif [ "$HTTP_STATUS" -eq 429 ]; then
        ((login_rate_limited_count++))
        print_error "Login Request $i - Rate Limited"
    else
        print_warning "Login Request $i - Other error: $HTTP_STATUS"
    fi
    
    sleep 0.1
done

# Clean up temporary file
rm "$TEMP_FILE"

echo ""
print_results "Login Endpoint Results:"
echo -e "${WHITE}Successful (expected failures): $login_success_count${NC}"
echo -e "${WHITE}Rate Limited: $login_rate_limited_count${NC}"
echo ""

# Test 3: Trip listing endpoint (optional auth)
print_info "Testing Trip Listing Endpoint..."
trip_success_count=0
trip_rate_limited_count=0

for ((i=1; i<=60; i++)); do
    # Make the request (no auth required)
    RESPONSE=$(curl -s -w "\n%{http_code}" \
        "$BASE_URL/api/chat")
    
    # Extract response body and status code
    RESPONSE_BODY=$(echo "$RESPONSE" | head -n -1)
    HTTP_STATUS=$(echo "$RESPONSE" | tail -n 1)
    
    if [ "$HTTP_STATUS" -eq 200 ]; then
        ((trip_success_count++))
        print_success "Trip Request $i - Success"
    elif [ "$HTTP_STATUS" -eq 429 ]; then
        ((trip_rate_limited_count++))
        print_error "Trip Request $i - Rate Limited"
    else
        print_warning "Trip Request $i - HTTP $HTTP_STATUS"
    fi
    
    sleep 0.1
done

echo ""
print_results "Trip Listing Endpoint Results:"
echo -e "${WHITE}Successful: $trip_success_count${NC}"
echo -e "${WHITE}Rate Limited: $trip_rate_limited_count${NC}"
echo ""

print_info "Testing Plan Endpoint..."
plan_success_count=0
plan_rate_limited_count=0

# Create temporary JSON file for plan request
PLAN_TEMP_FILE=$(mktemp)
cat > "$PLAN_TEMP_FILE" << EOF
{
    "searchData": {
        "searchQuery": "Test query for rate limit testing",
        "filters": {
            "timeOfDay": ["morning"],
            "environment": "indoor",
            "planTransit": false,
            "groupSize": "solo",
            "planFood": false,
            "priceRange": 2
        },
        "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")"
    },
    "userMessage": "Test message for rate limit testing"
}
EOF

for ((i=1; i<=40; i++)); do
    # Make the plan request
    RESPONSE=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TOKEN" \
        -d @"$PLAN_TEMP_FILE" \
        "$BASE_URL/api/plan")
    
    # Extract response body and status code
    RESPONSE_BODY=$(echo "$RESPONSE" | head -n -1)
    HTTP_STATUS=$(echo "$RESPONSE" | tail -n 1)
    
    if [ "$HTTP_STATUS" -eq 200 ]; then
        ((plan_success_count++))
        print_success "Plan Request $i - Success"
    elif [ "$HTTP_STATUS" -eq 429 ]; then
        ((plan_rate_limited_count++))
        print_error "Plan Request $i - Rate Limited"
    else
        print_warning "Plan Request $i - HTTP $HTTP_STATUS"
    fi
    
    sleep 0.1
done

# Clean up temporary file
rm "$PLAN_TEMP_FILE"

echo ""
print_results "Plan Endpoint Results:"
echo -e "${WHITE}Successful: $plan_success_count${NC}"
echo -e "${WHITE}Rate Limited: $plan_rate_limited_count${NC}"
echo ""

print_success "Rate Limit Testing Complete!"
echo ""
echo -e "${CYAN}Summary:${NC}"
echo -e "${WHITE}Profile Endpoint: $success_count success, $rate_limited_count rate limited${NC}"
echo -e "${WHITE}Login Endpoint: $login_success_count success, $login_rate_limited_count rate limited${NC}"
echo -e "${WHITE}Trip Listing: $trip_success_count success, $trip_rate_limited_count rate limited${NC}"
echo -e "${WHITE}Plan Endpoint: $plan_success_count success, $plan_rate_limited_count rate limited${NC}"
echo ""
echo -e "${YELLOW}Expected Rate Limits:${NC}"
echo -e "${WHITE}Profile: 30 requests/15min${NC}"
echo -e "${WHITE}Login: 10 requests/15min${NC}"
echo -e "${WHITE}Trip Listing: 50 requests/15min${NC}"
echo -e "${WHITE}Plan: 30 requests/15min${NC}" 
