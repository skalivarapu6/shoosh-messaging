import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ethers } from "ethers";
import CredentialManagerABI from "./CredentialManagerABI.json" with { type: "json" };
import DIDRegistryABI from "./DIDRegistryABI.json" with { type: "json" };

dotenv.config({ path: "../.env" });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const ISSUER_PRIVATE_KEY = process.env.ISSUER_PRIVATE_KEY;
const ALCHEMY_URL = process.env.ALCHEMY_MAINNET_URL;
const CREDENTIAL_MANAGER_ADDRESS = process.env.CREDENTIAL_MANAGER_ADDRESS;
const DID_REGISTRY_ADDRESS = process.env.DID_REGISTRY_ADDRESS;

if (!ISSUER_PRIVATE_KEY || !ALCHEMY_URL || !CREDENTIAL_MANAGER_ADDRESS || !DID_REGISTRY_ADDRESS) {
  console.error("Missing environment variables.");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(ALCHEMY_URL);
const issuerWallet = new ethers.Wallet(ISSUER_PRIVATE_KEY, provider);
const credentialManager = new ethers.Contract(
  CREDENTIAL_MANAGER_ADDRESS,
  CredentialManagerABI,
  issuerWallet
);
const didRegistry = new ethers.Contract(
  DID_REGISTRY_ADDRESS,
  DIDRegistryABI,
  issuerWallet
)

app.get("/", (_, res) => {
  res.send("Credential Issuer Backend Running");
});

// app.post("/issue-credential", async (req, res) => {
//   try {
//     const { did } = req.body;
//     if (!did || !did.startsWith("did:eth:")) {
//       return res.status(400).json({ error: "Invalid DID" });
//     }

//     const data = await didRegistry.getDID(did);
//     if (!data.exists) {
//       return res.status(400).json({ error: "DID Not Registered" });
//     }

//     const credential = {
//       type: "MessagingAccessCredential",
//       issuer: `did:eth:${issuerWallet.address}`
//     };

//     const blobString = JSON.stringify(credential);

//     const credentialHash = ethers.keccak256(ethers.toUtf8Bytes(blobString));
//     console.log("Issuing credential:", credentialHash);

//     const tx = await credentialManager.registerCredential(credentialHash);
//     await tx.wait();
//     console.log("Credential registered:", tx.hash);

//     res.json({
//       blob: credential,
//       hash: credentialHash,
//       txHash: tx.hash
//     });

//   } catch (err) {
//     console.error("Error issuing credential:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

app.post("/issue-credential", async (req, res) => {
  try {
    const { did } = req.body;
    if (!did || !did.startsWith("did:eth:")) {
      return res.status(400).json({ error: "Invalid DID" });
    }

    const data = await didRegistry.getDID(did);
    if (!data.exists) {
      return res.status(400).json({ error: "DID Not Registered" });
    }

    const credential = {
      type: "MessagingAccessCredential",
      issuer: `did:eth:${issuerWallet.address}`
    };

    const blobString = JSON.stringify(credential);
    const credentialHash = ethers.keccak256(ethers.toUtf8Bytes(blobString));
    console.log("Issuing credential:", credentialHash);

    try {
      // 🔹 This is the on-chain write that can revert with
      // "Credential: already registered"
      const tx = await credentialManager.registerCredential(credentialHash);
      await tx.wait();
      console.log("Credential registered:", tx.hash);

      return res.json({
        blob: credential,
        hash: credentialHash,
        txHash: tx.hash,
        status: "created"
      });
    } catch (err) {
      // Try to pull a readable message out of the error
      const msg =
        err?.reason ||
        err?.shortMessage ||
        err?.info?.error?.message ||
        err?.message ||
        "";

      if (msg.includes("Credential: already registered")) {
        console.log("Credential already registered on-chain, returning existing hash");

        // You can return 200 here if you want true idempotency.
        return res.status(409).json({
          error: "Credential already registered",
          hash: credentialHash,
          blob: credential,
          status: "already_exists"
        });
      }

      // Anything else still treated as an internal error
      throw err;
    }
  } catch (err) {
    console.error("Error issuing credential:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Credential Issuer running on http://localhost:${PORT}`);
});

