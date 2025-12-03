# Docker Setup for Blockchain Messaging Application

This application can be run using Docker for easier setup and testing.

## Prerequisites

- Docker Desktop installed ([Download here](https://www.docker.com/products/docker-desktop))
- MetaMask or another Web3 wallet
- Sepolia testnet ETH ([Get from faucet](https://sepoliafaucet.com/))

## Quick Start

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd message-encryption-service
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory with the following:

```env
# Required: Contract Addresses (already deployed on Sepolia)
CREDENTIAL_MANAGER_ADDRESS=<your_contract_address>
DID_REGISTRY_ADDRESS=<your_contract_address>
MESSAGE_METADATA_ADDRESS=<your_contract_address>

# Required: Server Configuration
ISSUER_PRIVATE_KEY=<your_private_key>
ALCHEMY_URL=<your_alchemy_url>

# Required: Client Configuration
VITE_ALCHEMY_KEY=<your_alchemy_key>
VITE_WALLET_CONNECT_PROJECT_ID=<your_project_id>

# Optional: Pinata IPFS (for production)
VITE_PINATA_API_KEY=<your_pinata_key>
VITE_PINATA_SECRET_KEY=<your_pinata_secret>
VITE_PINATA_JWT=<your_pinata_jwt>
```

### 3. Start the Application

```bash
docker-compose up --build
```

This will:
- Build both the client and server containers
- Start the server on `http://localhost:3001`
- Start the client on `http://localhost:5173`

### 4. Access the Application

Open your browser and navigate to:
```
http://localhost:5173
```

### 5. Connect Your Wallet

1. Click "Connect Wallet"
2. Select your wallet (MetaMask, Rainbow, etc.)
3. Approve the connection
4. Follow the on-screen instructions to:
   - Register your DID
   - Request a credential
   - Start messaging!

## For Testers (Minimal Setup)

If you just want to test the application without the server:

### Option A: Use Existing Deployed Contracts

1. Create a `.env` file with **only** the contract addresses:

```env
CREDENTIAL_MANAGER_ADDRESS=<provided_by_admin>
DID_REGISTRY_ADDRESS=<provided_by_admin>
MESSAGE_METADATA_ADDRESS=<provided_by_admin>
VITE_ALCHEMY_KEY=<your_own_alchemy_key>
VITE_WALLET_CONNECT_PROJECT_ID=<your_project_id>
```

2. Run only the client:

```bash
docker-compose up client
```

### Option B: Run Without Docker

```bash
# Install dependencies
cd client && npm install

# Start the client
npm run dev
```

## Stopping the Application

```bash
# Stop all containers
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

## Troubleshooting

### Port Already in Use

If ports 3001 or 5173 are already in use, modify `docker-compose.yml`:

```yaml
ports:
  - "3002:3001"  # Change 3001 to 3002
  - "5174:5173"  # Change 5173 to 5174
```

### Environment Variables Not Loading

Make sure your `.env` file is in the **root directory** (same level as `docker-compose.yml`).

### Wallet Connection Issues

1. Make sure you're on the Sepolia testnet in MetaMask
2. Clear your browser cache and try again
3. Check that you have some Sepolia ETH

## Development Mode

To run in development mode with hot reload:

```bash
# The containers are already configured for development
# Just edit your code and changes will reflect automatically
```

## Production Build

For production deployment:

```bash
# Build production images
docker-compose -f docker-compose.prod.yml up --build
```

(Note: You'll need to create a `docker-compose.prod.yml` for production configuration)

## Architecture

```
┌─────────────────┐
│   Client (5173) │  ← React + Vite + Wagmi
└────────┬────────┘
         │
         ├─────────► MetaMask (User's Wallet)
         │
         ├─────────► Sepolia Testnet (Smart Contracts)
         │
         └─────────► Server (3001)  ← Credential Issuance
```

## Features

- ✅ Decentralized Identity (DID)
- ✅ Verifiable Credentials
- ✅ Encrypted Messaging
- ✅ IPFS Storage
- ✅ Blockchain Commitments
- ✅ Read Receipts

## Support

For issues or questions, please open an issue on GitHub.
