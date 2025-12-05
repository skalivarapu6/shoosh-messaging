import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useWriteContract, useChainId, useSwitchChain } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { DIDRegistryABI } from "./contracts/DIDRegistry";
import { useCredentialStatus } from './hooks/useCredentialStatus';
import MessagingDashboard from './components/MessagingDashboard';

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContract: registerDID } = useWriteContract();

  // Custom hook to check if we have a valid credential
  const { hasCredential, isCredentialLoading } = useCredentialStatus();

  const did = address ? `did:eth:${address.toLowerCase()}` : "";

  // Check if DID is registered using the 'exists' function
  const { data: isDIDRegistered, isLoading: isDIDLoading } = useReadContract({
    address: import.meta.env.VITE_DID_REGISTRY_ADDRESS,
    abi: DIDRegistryABI,
    functionName: "exists",
    args: [did],
    query: {
      enabled: !!address
    }
  });

  // Function to request credential from backend
  async function requestCredential() {
    if (!did) return;

    try {
      const response = await fetch("http://localhost:3001/issue-credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ did }),
      });

      let data;
      try {
        data = await response.json();
      } catch (err) {
        console.error("Failed to parse JSON", err);
        alert("Server returned invalid JSON");
        return;
      }

      if (response.status === 409 && data.status === "already_exists") {


        if (data.blob) {
          localStorage.setItem('credential', JSON.stringify(data.blob));
          alert("Credential already exists! Redirecting to dashboard...");
          // Force reload to trigger hasCredential check
          window.location.reload();
        } else {
          console.error("Server didn't return credential blob");
          alert("Credential exists on chain but server didn't return it. Please contact support.");
        }
        return;
      }

      if (!response.ok) {
        console.error("Error issuing credential:", data);
        alert(`Error issuing credential: ${data.error || response.status}`);
        return;
      }

      localStorage.setItem("credential_blob", JSON.stringify(data.blob));

      alert("Credential issued successfully!");
      window.location.reload();

    } catch (error) {
      console.error("Request credential error:", error);
      alert("Failed to request credential");
    }
  }

  if (!isConnected) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <h1>Message Encryption Service</h1>
        <ConnectButton />
      </div>
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

  if (isDIDLoading || isCredentialLoading) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  if (!isDIDRegistered) {
    return (
      <div style={{ padding: "2rem" }}>
        <h2>Identity Registration</h2>
        <p>Your DID: {did}</p>
        <p>You need to register your DID on-chain before you can use the service.</p>
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

  if (!hasCredential) {
    return (
      <div style={{ padding: "2rem" }}>
        <h2>Verification Required</h2>
        <p>You must obtain a valid messaging credential before continuing.</p>
        <button onClick={requestCredential}>
          Request Credential
        </button>
      </div>
    );
  }

  return <MessagingDashboard />;
};

export default App;