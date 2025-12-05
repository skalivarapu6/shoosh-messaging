#!/bin/bash

# Clear Local Storage Test Script
# This resets the local app state without affecting blockchain data

echo "🧹 Clearing local storage for messaging app..."

# Instructions for manual clearing
cat << 'EOF'

To reset your local app state:

1. Open your browser (Chrome/Brave)
2. Press F12 to open DevTools
3. Go to the "Application" tab
4. In the left sidebar, expand "Local Storage"
5. Click on "http://localhost:5173"
6. Right-click and select "Clear"
7. Refresh the page

This will clear:
- Sent message history
- IPFS CID mappings
- Any cached data

This will NOT clear:
- Blockchain registrations (DIDs, messages)
- Server-side CID storage

EOF

echo ""
echo "✅ Instructions displayed above"
