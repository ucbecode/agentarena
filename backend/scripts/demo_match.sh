#!/bin/bash

# Demo script to create and run a simulated match
# This bypasses auth for demo purposes

API_URL="http://localhost:3460"

echo "Creating demo match between Agent #42 (Cyan) and Agent #77 (Magenta)..."

# Create a match directly via internal endpoint
curl -s -X POST "$API_URL/api/demo/create-match" \
  -H "Content-Type: application/json" \
  -d '{
    "agent1Id": 42,
    "agent2Id": 77,
    "tier": 2,
    "duration": 300
  }'

echo ""
echo "Match created! Open http://localhost:3461 and click on the match to watch."
