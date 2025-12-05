# Full Reset Guide

## Option 1: Use New Wallets (Recommended for Testing)
1. Create 2 new accounts in MetaMask/Rainbow
2. Get Sepolia ETH from faucet for both
3. Test the full registration → messaging → acknowledgment flow

## Option 2: Redeploy Contracts (Complete Fresh Start)

If you want to start completely fresh with new contracts:

```bash
# 1. Navigate to project root
cd /Users/skali/Desktop/academic\ abyss/Fall\ 2025/Engineering\ Blockchain\ and\ Applications/message-encryption-service

# 2. Redeploy contracts
npx hardhat run scripts/deploy.js --network sepolia

# 3. Update .env files with new contract addresses
# The deploy script will output the new addresses

# 4. Restart your server
cd server
node server.js

# 5. Restart your client
cd ../client
npm run dev
```

## Option 3: Clear Local Data Only

This won't affect blockchain, but resets your local app:

### Clear Browser Local Storage:
1. Open DevTools (F12)
2. Application tab → Local Storage → http://localhost:5173
3. Right-click → Clear
4. Refresh page

### Clear Server CID Storage:
```bash
rm /Users/skali/Desktop/academic\ abyss/Fall\ 2025/Engineering\ Blockchain\ and\ Applications/message-encryption-service/server/cids.json
```

## What Each Option Clears

| Data Type | New Wallets | Redeploy Contracts | Clear Local |
|-----------|-------------|-------------------|-------------|
| DID Registrations | ✅ Fresh | ✅ Fresh | ❌ Stays |
| Messages | ✅ Fresh | ✅ Fresh | ❌ Stays |
| Local Message Cache | ✅ Fresh | ✅ Fresh | ✅ Cleared |
| Server CID Mappings | ❌ Stays | ❌ Stays | ✅ Cleared |

## Recommendation

For **testing the full user flow**, I recommend **Option 1 (New Wallets)**:
- Quick and easy
- No redeployment needed
- Simulates real new users
- Keeps your existing test data intact
