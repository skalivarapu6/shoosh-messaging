# Tester Setup Guide

Welcome! This guide will help you test the blockchain messaging application.

## Prerequisites

1. **MetaMask** or another Web3 wallet
2. **Sepolia testnet ETH** ([Get from faucet](https://sepoliafaucet.com/))
3. **Node.js** installed (v18 or higher)

---

## Quick Setup (Recommended)

### Step 1: Get Contract Addresses

Ask the project owner for these three contract addresses:
- `CREDENTIAL_MANAGER_ADDRESS`
- `DID_REGISTRY_ADDRESS`
- `MESSAGE_METADATA_ADDRESS`

### Step 2: Get Your API Keys

1. **Alchemy API Key**:
   - Go to [https://www.alchemy.com/](https://www.alchemy.com/)
   - Sign up and create a new app on **Sepolia testnet**
   - Copy your API key

2. **WalletConnect Project ID**:
   - Go to [https://cloud.walletconnect.com/](https://cloud.walletconnect.com/)
   - Create a new project
   - Copy your Project ID

### Step 3: Create `.env` File

**Important**: Create the `.env` file in the **root directory** of the project (not inside `client/` or `server/`).

The root `.env` file will be used by both the client and server.

**File location**: `message-encryption-service/.env`

```env
# Contract Addresses (provided by project owner)
CREDENTIAL_MANAGER_ADDRESS=0x2d08B3058d8B81A7d829f739150dcFBc7796500e
DID_REGISTRY_ADDRESS=0xc2b7311983353Be4f28532CB2A9A1a27439bd6a5
MESSAGE_METADATA_ADDRESS=0xc0eC0434496c1d44ead23aA9EF0186857899A214

# Your API Keys (with VITE_ prefix for client)
VITE_ALCHEMY_KEY=your_alchemy_api_key_here
VITE_WALLET_CONNECT_PROJECT_ID=your_walletconnect_project_id_here
VITE_CREDENTIAL_MANAGER_ADDRESS=0x2d08B3058d8B81A7d829f739150dcFBc7796500e
VITE_DID_REGISTRY_ADDRESS=0xc2b7311983353Be4f28532CB2A9A1a27439bd6a5
VITE_MESSAGE_METADATA_ADDRESS=0xc0eC0434496c1d44ead23aA9EF0186857899A214
```

**Note**: Variables with `VITE_` prefix are used by the client (Vite reads these).

### Step 4: Install Dependencies

```bash
cd client
npm install
```

### Step 5: Start the Client

```bash
npm run dev
```

The app will open at `http://localhost:5173`

### Step 6: Connect to the Server

Make sure the project owner is running the server at `http://localhost:3001`.

If you want to run your own server, see the **Full Setup** section below.

---

## Using the Application

### 1. Connect Your Wallet
- Click "Connect Wallet"
- Select your wallet (MetaMask, Rainbow, etc.)
- Approve the connection
- **Make sure you're on Sepolia testnet**

### 2. Register Your DID
- Click "Register Identity"
- Approve the transaction in your wallet
- Wait for confirmation (~12 seconds)

### 3. Request a Credential
- Click "Request Credential"
- Wait for the server to issue your credential
- You'll see "Credential issued successfully!"

### 4. Start Messaging!
- You'll be redirected to the messaging dashboard
- To send a message:
  - Enter recipient's DID (format: `did:eth:0x...`)
  - Type your message
  - Click "Send Message"
  - Approve the transaction

---

## Full Setup (Optional)

If you want to run your own server:

### Additional Environment Variables

Add these to your `.env` file:

```env
# Server Configuration
ISSUER_PRIVATE_KEY=your_private_key_here
ALCHEMY_URL=https://eth-sepolia.g.alchemy.com/v2/your_alchemy_key_here
```

⚠️ **Warning**: Never share your private key or commit it to Git!

### Start the Server

```bash
cd server
npm install
node server.js
```

The server will run at `http://localhost:3001`

---

## Troubleshooting

### "Wrong Network" Error
- Switch to Sepolia testnet in MetaMask
- Click the network dropdown → Select "Sepolia test network"

### "Credential already registered"
- This is normal if you've registered before
- The app will recover your credential automatically
- Refresh the page if you're not redirected

### "CID Missing (Historical)"
- This means the message was sent before you were online
- You can only read messages received while you're connected
- Or if the sender stored the CID on the server

### Port Already in Use
- Kill the process: `lsof -ti:5173 | xargs kill -9`
- Or use a different port: `npm run dev -- --port 5174`

---

## Getting Your DID

Your DID is automatically generated from your wallet address:
```
did:eth:0x<your_wallet_address>
```

For example, if your wallet is `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0`, your DID is:
```
did:eth:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0
```

---

## Need Help?

Contact the project owner or check the main README.md for more information.

Happy messaging! 🚀
