import { useReadContract } from "wagmi";
import { CredentialManagerABI } from "../contracts/CredentialManager";
import { keccak256, toUtf8Bytes } from "ethers";


export function useCredentialStatus() {
  const credentialBlob = localStorage.getItem("credential_blob");
  const credentialHash = credentialBlob
    ? keccak256(toUtf8Bytes(credentialBlob))
    : "0x0000000000000000000000000000000000000000000000000000000000000000";

  const { data: hasCredential, isLoading, refetch } = useReadContract({
    address: import.meta.env.VITE_CREDENTIAL_MANAGER_ADDRESS,
    abi: CredentialManagerABI,
    functionName: "verifyCredential",
    args: [credentialHash],
    query: {
      enabled: !!credentialBlob,
    },
  });

  return {
    hasCredential: Boolean(hasCredential),
    isCredentialLoading: isLoading,
    refetchCredential: refetch
  };
}
