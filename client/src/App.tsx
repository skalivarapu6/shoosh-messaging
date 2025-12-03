
// import { ConnectButton } from '@rainbow-me/rainbowkit';
// import { useAccount, useReadContract, useWriteContract, useChainId, useSwitchChain } from 'wagmi';
// import { sepolia } from 'wagmi/chains';
// import { DIDRegistryABI } from "./contracts/DIDRegistry";
// import { useCredentialStatus } from './hooks/useCredentialStatus';
// import MessagingDashboard from './components/MessagingDashboard';

// const App = () => {
//   async function requestCredential(did: string) {
//     const response = await fetch("http://localhost:3001/issue-credential", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ did }),
//     });

//     const result = await response.json();
    
//     localStorage.setItem("credential_blob", JSON.stringify(result.blob));

//     console.log("Credential issued:", result);
//   }

//   const { address, isConnected } = useAccount();

//   const did = address
//     ? `did:eth:${address.toLowerCase()}`
//     : "";

//   const { data, isLoading, error } = useReadContract({
//     address: import.meta.env.VITE_DID_REGISTRY_ADDRESS,
//     abi: DIDRegistryABI,
//     functionName: "getDID",
//     args: [did],
//   });

//   const { hasCredential, isCredentialLoading } = useCredentialStatus();

//   const { writeContract: registerDID } = useWriteContract();
//   const chainId = useChainId();
//   const { switchChain } = useSwitchChain();
//   if (!isConnected) {
//     return (
//       <ConnectButton />
//     );
//   }

//   if (chainId !== sepolia.id) {
//     return (
//       <div style={{ padding: '2rem', textAlign: 'center' }}>
//         <h2>Wrong Network</h2>
//         <p>Please switch to Sepolia to use this application.</p>
//         <button onClick={() => switchChain({ chainId: sepolia.id })}>
//           Switch to Sepolia
//         </button>
//       </div>
//     );
//   }

//   if (isLoading || isCredentialLoading) {
//     return (
//       <div>Loading...</div>
//     );
//   }

//   if (!data || error) {
//     return (
//       <div>
//         <p>Your DID: {did}</p>
//         <button
//           onClick={() => {
//             registerDID({
//               address: import.meta.env.VITE_DID_REGISTRY_ADDRESS,
//               abi: DIDRegistryABI,
//               functionName: "registerDID",
//               args: [address, "initial-doc-hash"]
//             });
//           }}
//         >
//           Register Identity
//         </button>
//       </div>
//     );
//   }

//   if (data && !hasCredential) {
//     return (
//       <div style={{ padding: "2rem" }}>
//         <h2>Verification Required</h2>
//         <p>You must obtain a valid messaging credential before continuing.</p>

//         <button onClick={async () => await requestCredential(did)}>
//           Request Credential
//         </button>
//       </div>
//     );
//   }

//   return <MessagingDashboard />;
// };

// export default App;


import React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

const App: React.FC = () => {
  const { address, isConnected } = useAccount();

  // ---- Call backend to issue credential ----
  async function requestCredential(did: string) {
    let data: any = null;

    const response = await fetch("http://localhost:3001/issue-credential", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ did }),
    });

    // Safely parse JSON
    try {
      data = await response.json();
    } catch (err) {
      const raw = await response.text();
      console.error("Failed to parse JSON. Server returned:", raw);
      alert("Server returned invalid JSON.");
      return;
    }

    // Already registered on-chain
    if (response.status === 409 && data.status === "already_exists") {
      console.log("Credential already registered:", data.hash);
      alert("Credential already exists — you're good to go.");
      return;
    }

    // Other errors
    if (!response.ok) {
      console.error("Error issuing credential:", data);
      alert(`Error issuing credential: ${data.error || response.status}`);
      return;
    }

    // Success
    localStorage.setItem("credential_blob", JSON.stringify(data.blob));
    console.log("Credential issued:", data);
    alert("Credential issued successfully.");
  }

  // ---- Click handler for the button ----
  const handleRequestCredentialClick = async () => {
    if (!address) return;
    const did = `did:eth:${address.toLowerCase()}`;
    await requestCredential(did);
  };

  // ---- Render logic ----
  if (!isConnected) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Message Encryption Service</h1>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Message Encryption Service</h1>
      <ConnectButton />
      <p>
        Connected address: <code>{address}</code>
      </p>
      <p>
        DID: <code>{`did:eth:${address?.toLowerCase()}`}</code>
      </p>

      <button onClick={handleRequestCredentialClick} style={{ marginTop: 16 }}>
        Request Credential
      </button>
    </div>
  );
};

export default App;