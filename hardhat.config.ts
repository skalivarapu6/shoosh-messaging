import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
    solidity: "0.8.21",
    networks: {
        sepolia: {
            url: process.env.ALCHEMY_MAINNET_URL || "",
            accounts: process.env.ISSUER_PRIVATE_KEY ? [process.env.ISSUER_PRIVATE_KEY] : [],
        },
    },
};

export default config;
