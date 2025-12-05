import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';
import { http } from 'wagmi';

const alchemyKey = import.meta.env.VITE_ALCHEMY_KEY;
const isValidKey = alchemyKey && alchemyKey !== "<my_api_key>" && alchemyKey !== "YOUR_ALCHEMY_KEY";

const projectId = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

if (projectId === 'YOUR_PROJECT_ID') {
  console.error("⚠️ VITE_WALLET_CONNECT_PROJECT_ID is not set. WalletConnect features will fail.");
}

export const config = getDefaultConfig({
  appName: 'Message Encryption Service',
  projectId,
  chains: [
    sepolia,
  ],
  transports: {
    [sepolia.id]: isValidKey
      ? http(`https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`, {
        // Reduce polling frequency to minimize API calls
        batch: {
          wait: 100, // Batch requests within 100ms
        },
        retryCount: 3,
        timeout: 30_000,
      })
      : http(),
  },
  // Optimize polling intervals
  pollingInterval: 12_000, // Poll every 12 seconds instead of default 4 seconds
});
