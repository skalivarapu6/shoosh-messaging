import { ethers } from "hardhat";

async function main() {
    console.log("Deploying MessageMetadata to Sepolia...");

    // Deploy MessageMetadata
    const MessageMetadata = await ethers.getContractFactory("MessageMetadata");
    const messageMetadata = await MessageMetadata.deploy();
    await messageMetadata.waitForDeployment();
    const messageMetadataAddress = await messageMetadata.getAddress();
    console.log("✅ MessageMetadata deployed to:", messageMetadataAddress);

    console.log("\n📝 Update this in your .env file:");
    console.log(`VITE_MESSAGE_METADATA_ADDRESS=${messageMetadataAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
