# Application Identity on Blockchain

## What Identifies YOUR Application

Your application's identity on the Sepolia blockchain is defined by **3 smart contract addresses**:

### 1. **DIDRegistry Contract**
- **Purpose**: Manages user identity registrations
- **Your Address**: `0x...` (in your `.env` file)
- **What it stores**: Mapping of DIDs to user addresses and metadata

### 2. **CredentialManager Contract**
- **Purpose**: Issues and verifies credentials for users
- **Your Address**: `0x...` (in your `.env` file)
- **What it stores**: Credential hashes and verification status

### 3. **MessageMetadata Contract**
- **Purpose**: Stores message commitments and acknowledgments
- **Your Address**: `0xc0eC0434496c1d44ead23aA9EF0186857899A214` (from TESTER_SETUP.md)
- **What it stores**: Message hashes, sender/receiver DIDs, timestamps, acknowledgment status

## These Addresses ARE Your Application

Think of it this way:
- **Your contracts** = Your application's database on the blockchain
- **Anyone using these addresses** = Using YOUR application instance
- **Different addresses** = Completely separate application instance

## For Someone to Deploy Their Own Instance

They would need to:

### Step 1: Deploy New Contracts
```bash
npx hardhat run scripts/deploy.js --network sepolia
```

This will output 3 NEW contract addresses (different from yours).

### Step 2: Update Environment Variables

#### Server `.env` file:
```bash
# Their own deployed contracts
CREDENTIAL_MANAGER_ADDRESS=0x[their_new_address]
DID_REGISTRY_ADDRESS=0x[their_new_address]

# Their own keys
ISSUER_PRIVATE_KEY=[their_wallet_private_key]
ALCHEMY_MAINNET_URL=https://eth-sepolia.g.alchemy.com/v2/[their_api_key]
```

#### Client `.env` file:
```bash
# Their own deployed contracts
VITE_MESSAGE_METADATA_ADDRESS=0x[their_new_address]
VITE_DID_REGISTRY_ADDRESS=0x[their_new_address]
VITE_CREDENTIAL_MANAGER_ADDRESS=0x[their_new_address]

# Their own API keys
VITE_ALCHEMY_KEY=[their_alchemy_key]
VITE_WALLET_CONNECT_PROJECT_ID=[their_walletconnect_id]
```

### Step 3: Update Contract ABIs (if they modified contracts)
If they changed the smart contracts, they'd need to:
1. Copy the new ABIs from `artifacts/contracts/` after compilation
2. Update the ABI files in:
   - `client/src/` (for frontend)
   - `server/` (for backend)

## What Stays the Same vs Changes

| Component | Same for Everyone | Unique per Deployment |
|-----------|------------------|----------------------|
| Smart Contract Code | ✅ Same | ❌ |
| Contract Addresses | ❌ | ✅ Unique |
| Blockchain Network | ✅ Sepolia | ❌ |
| User DIDs | ❌ | ✅ Per instance |
| Messages | ❌ | ✅ Per instance |
| API Keys | ❌ | ✅ Each user's own |

## Key Insight

**Your application = Your 3 contract addresses**

- Users registering DIDs on YOUR contracts → Part of YOUR app
- Users registering DIDs on THEIR contracts → Part of THEIR app
- **No overlap** - completely separate data/users

## Example Scenario

**Your Instance:**
- MessageMetadata: `0xc0eC0434496c1d44ead23aA9EF0186857899A214`
- Users: Alice, Bob, Charlie
- Messages: 100 messages between them

**Their Instance (after redeployment):**
- MessageMetadata: `0x1234567890abcdef...` (different!)
- Users: Dave, Eve, Frank (completely separate)
- Messages: 0 messages (fresh start)

Even if Alice exists in both, they're **different registrations** in different contract instances.

## Summary

To run this as **their own application**, someone needs to:

1. ✅ Deploy their own contracts → Get 3 new addresses
2. ✅ Update `.env` files with those addresses
3. ✅ Use their own API keys (Alchemy, WalletConnect)
4. ✅ Run the server and client

That's it! The code stays the same, only the **configuration changes**.
