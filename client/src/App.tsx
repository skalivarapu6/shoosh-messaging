
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useWriteContract, useChainId, useSwitchChain } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { DIDRegistryABI } from "./contracts/DIDRegistry";
import { useCredentialStatus } from './hooks/useCredentialStatus';
import MessagingDashboard from './components/MessagingDashboard';

const App = () => {
  async function requestCredential(did: string) {
    const response = await fetch("http://localhost:3001/issue-credential", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ did }),
    });

    const result = await response.json();

    localStorage.setItem("credential_blob", JSON.stringify(result.blob));

    console.log("Credential issued:", result);
  }

  const { address, isConnected } = useAccount();

  const did = address
    ? `did: eth:${address.toLowerCase()} `
    : "";

  const { data, isLoading, error } = useReadContract({
    address: import.meta.env.VITE_DID_REGISTRY_ADDRESS,
    abi: DIDRegistryABI,
    functionName: "getDID",
    args: [did],
  });

  const { hasCredential, isCredentialLoading } = useCredentialStatus();

  const { writeContract: registerDID } = useWriteContract();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    return (
      <ConnectButton />
    );
  }

  if (chainId !== sepolia.id) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Wrong Network</h2>
        <p>Please switch to Sepolia to use this application.</p>
        <button onClick={() => switchChain({ chainId: sepolia.id })}>
          Switch to Sepolia
        </button>
      </div>
    );
  }

  if (isLoading || isCredentialLoading) {
    return (
      <div>Loading...</div>
    );
  }

  if (!data || error) {
    return (
      <div>
        <p>Your DID: {did}</p>
        <button
          onClick={() => {
            registerDID({
              address: import.meta.env.VITE_DID_REGISTRY_ADDRESS,
              abi: DIDRegistryABI,
              functionName: "registerDID",
              args: [address, "initial-doc-hash"]
            });
          }}
        >
          Register Identity
        </button>
      </div>
    );
  }

  if (data && !hasCredential) {
    return (
      <div style={{ padding: "2rem" }}>
        <h2>Verification Required</h2>
        <p>You must obtain a valid messaging credential before continuing.</p>

        <button onClick={async () => await requestCredential(did)}>
          Request Credential
        </button>
      </div>
    );
  }

  return <MessagingDashboard />;
};
  if (window.ethereum) {
    window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }], // Sepolia
    }).catch(console.error);
  }
export default App;
