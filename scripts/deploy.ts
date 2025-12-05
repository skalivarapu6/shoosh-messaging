import { ethers } from "hardhat";

async function main() {
    console.log("Deploying contracts to Sepolia...");

    console.log("\n1. Deploying DIDRegistry...");
    const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
    const didRegistry = await DIDRegistry.deploy();
    await didRegistry.waitForDeployment();
    const didRegistryAddress = await didRegistry.getAddress();
    console.log("✅ DIDRegistry deployed to:", didRegistryAddress);

    console.log("\n2. Deploying MessageMetadata...");
    const MessageMetadata = await ethers.getContractFactory("MessageMetadata");
    const messageMetadata = await MessageMetadata.deploy();
    await messageMetadata.waitForDeployment();
    const messageMetadataAddress = await messageMetadata.getAddress();
    console.log("✅ MessageMetadata deployed to:", messageMetadataAddress);

    console.log("\n3. Deploying CredentialManager...");
    const CredentialManager = await ethers.getContractFactory("CredentialManager");
    const credentialManager = await CredentialManager.deploy();
    await credentialManager.waitForDeployment();
    const credentialManagerAddress = await credentialManager.getAddress();
    console.log("✅ CredentialManager deployed to:", credentialManagerAddress);

    console.log("\n🎉 All contracts deployed successfully!");
    console.log("\n📝 Add these to your .env file:");
    console.log(`CREDENTIAL_MANAGER_ADDRESS=${credentialManagerAddress}`);
    console.log(`DID_REGISTRY_ADDRESS=${didRegistryAddress}`);
    console.log(`MESSAGE_METADATA_ADDRESS=${messageMetadataAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
