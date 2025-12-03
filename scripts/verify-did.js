import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const DID_REGISTRY_ABI = JSON.parse(
    readFileSync('./server/DIDRegistryABI.json', 'utf8')
);

async function verifyDID(address) {
    // Connect to Sepolia
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

    // Create contract instance
    const didRegistry = new ethers.Contract(
        process.env.DID_REGISTRY_ADDRESS,
        DID_REGISTRY_ABI,
        provider
    );

    // Format the DID string the same way the contract does
    const did = `did:eth:${address.toLowerCase()}`;

    console.log(`\n🔍 Checking DID: ${did}\n`);

    try {
        // Check if DID exists
        const exists = await didRegistry.exists(did);
        console.log(`✅ DID Exists: ${exists}`);

        if (exists) {
            // Get full DID details
            const didData = await didRegistry.getDID(did);
            console.log(`\n📋 DID Details:`);
            console.log(`   Controller: ${didData.controller}`);
            console.log(`   Document Hash: ${didData.didDocumentHash}`);
            console.log(`   Service Endpoint: ${didData.serviceEndpoint || '(not set)'}`);
            console.log(`   Public Key: ${didData.publicKey || '(not set)'}`);

            // Get registration event
            const filter = didRegistry.filters.DIDRegistered(did);
            const events = await didRegistry.queryFilter(filter);

            if (events.length > 0) {
                const event = events[0];
                const block = await provider.getBlock(event.blockNumber);
                const timestamp = new Date(block.timestamp * 1000);
                console.log(`\n📅 Registered at: ${timestamp.toLocaleString()}`);
                console.log(`📦 Block Number: ${event.blockNumber}`);
                console.log(`🔗 Transaction: ${event.transactionHash}`);
            }
        } else {
            console.log(`\n❌ DID not registered yet.`);
        }
    } catch (error) {
        console.error(`\n❌ Error verifying DID:`);
        console.error(error.message);
    }
}

// Get address from command line or use default
const address = process.argv[2] || process.env.YOUR_WALLET_ADDRESS;

if (!address) {
    console.error('Please provide an address:');
    console.error('  node scripts/verify-did.js 0xYourAddress');
    process.exit(1);
}

verifyDID(address);
