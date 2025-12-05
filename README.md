# message-encryption-service

## Description
Blockchain focuses on decentralisation and consensus, a single entity cannot control the entire network. With raising concerns about data privacy, users are more interested now more than ever to have autonmous control over the data they are sending over the network. Especially in the messaging space, there is a steady rise in the use of applications that promote privacy and data control. By leveraging blockchain's core principles of decentralization and cryptographic security users can communicate peer-to-peer while maintaining full control over their identity and data. The systems uses smart contracts for user registration and identity verification, while messages are transmitted off-chain to maintain efficient and privacy


## Dependencies or Setup Instructions
#### Blockchain
- Contract Development: Solidity - Implementing blockchain-based mesagin system using Solidity. The smart contract manages user registratin, public keys, and message metadata on Ethereum while encrypted messages are delivered off-chain through peer-2-peer or server networks 
- Deployment: Hardhat - Deploying Solidity contracts using Hardhhat to Ethereum test networks.The proposed architecture separates on-chain metadata from off-chain message delivery balancing decentralization with practical gas costs
- Frontend Integration: Ether.js - Ether.js is a Typescript library that connects the web with Ethereum. With it you can integrate ethereum with the client side of web applications. This can be used for displaying wallet amounts, authentication, etc. 

#### Off-chain
- IPFS: Pinata - Pinata will provide IPFS gateway services for decentralized off-chain message storage. Encrypted messages will be uploaded to IPFS through Pinata's API, generating CIDs(content hashes) that are stored on chain for verification.
- Message Transport: libp2p - This package is a modular networking stack that forms the layers needed for peer to peer communicatoin, using the InterPlanetary Fiile System(IPFS) It provides tools for nodes to discover each other, estabilsh secure connections, and communicate effectively in a decentralized network. 

## How to Use or Deploy
### Deployment: Setting up the Infrastructure

#### Project Initialization
1. Project Setup: Use Truffle to intialize the environment.
2. Smart Contract: Write the contracts in Solidity within contracts/ directory:

    1. DIDRegistry.sol: Contract responsible for mapping use generated keys to their respective DIDs and registering them on-chain.
    
    2. CredentialStatus.sol: Contract that manages the status of credentials using repsective IPFS hashes.
3. Compilation: Compile the Solidity code using Truffle CLI.
    ```solidity 
    truffle compile
    ```

#### Off-Chain Setup

. IPFS Node: Set up and run a IPFS node to serve as the storage layer for credentials.

. Relay Server: Deploy the application's own Relay Server that takes care of the end to end encrypted message transmission between users.

#### Contract Migration

1. Migration Scripts: Create migration scripts to manage the deployment order of DIDRegistry and CredentialStatus contracts.

2. Deployement Execution: Execute the scripts to launch the contracts onto the network.
    ```solidity 
    truffle migrate
    ```  

## Draft Contract
### DID / Identiy Registry Contract

This contract is the heart of the dApp and the IAM. Here the decentralized identifiers (DIDs) and metadata are anchored. It acts as a blockchain phonebook mapping DIDs to cryptographic controllers. This contract will include the DID, endpoints for IPFS and messaging URIs, and version/update timestamps.

##### Register DID

```solidity
function registerDID(controller, calldatadidDocumentHash)
```
This function registers a new decentralized identity on-chain. It links the caller’s blockchain address to their DID document stored on IPFS. This ensures identity ownership is user-controlled, verifiable, and censorship-resistant. The stored hash lets others retrieve public keys and messaging endpoints without trusting a central server. 

##### Update Service Endpoints

```solidity
function updateServiceEndpoint(newEndpoint)
```
This function updates the communication or metadata endpoint inside the DID record. If users change IPFS gateways, storage providers, or messaging relay services, they can modify this endpoint. It keeps communication functional and prevents identity becoming outdated while maintaining user data sovereignty.

##### Rotate Key
```solidity
function rotateKey(newController)
```
This function allows the DID owner to replace their public key or controller address. Key rotation is crucial when keys are compromised, upgraded for security, or moved across devices. It preserves identity continuity without requiring re-registration or creating a new DID.

##### Log New DID
```solidity
event DIDRegistered(did, controller, timestamp);
```
Runs when a user successfully creates their DID, providing a verifiable registration record.

##### Log Updated DID
```solidity
event DIDUpdated(did, changes);
```
This event is emitted whenever a user modifies their DID data, such as updating their IPFS endpoint or metadata. It provides a public audit trail that shows the DID has evolved over time, allowing verifiers to confirm the most recent identity information without ambiguity.

##### Log Key Rotation
```solidity
event KeyRotated(oldController, newController);
```
This event is emitted when the owner of a DID changes their associated controller key. It ensures transparency in cases where keys are replaced, so other participants can verify trust continuity and detect potential compromise or ownership transfer.


### Credential Manager Contract
This contract manages the lifecycle of verifiable credentials associated with decentralized identities. Instead of storing full credentials, it stores and tracks credential hashes, ensuring privacy while enabling decentralized verification and revocation. It provides trust assurance for identity claims without relying on centralized authorities

##### Register Credential
```solidity
function registerCredential(credentialHash)
```
This function registers a credential’s cryptographic hash on the blockchain to prove it exists and was issued by a specific authority. No private data is stored. Verification becomes trustless, auditable, and independent of centralized databases while maintaining privacy.

##### Revoke Credential
```solidity
function revokeCredential(credentialHash)
```
This function marks a previously issued credential as invalid. Revocation is necessary when credentials expire, identities change, or compromise is suspected. It ensures verifiers only trust active credentials while maintaining transparency and reducing the risk of impersonation or unauthorized system access.

##### Verify Credential
```solidity
function verifyCredential(credentialHash) view returns (bool)
```
This function checks whether a credential is still valid by verifying that it exists in the contract and has not been revoked. It enables decentralized trust validation without needing to contact issuers directly or query centralized validation servers.

##### Log New Credential
```solidity
event CredentialIssued(issuer, credentialHash, timestamp);
```
This event is emitted when a new credential hash is registered on-chain. It publicly records which issuer validated or certified a user's identity attributes, enabling transparent verification while ensuring that no sensitive personal data is exposed.

##### Log Revoked Credential
```solidity
event CredentialRevoked(issuer, credentialHash, timestamp);
```
This event is emitted when a credential is revoked by its issuer. It publicly signals that the previously valid credential should no longer be trusted, enabling real-time credential status checks and preventing impersonation or unauthorized system access.

### Messaging Metadata Contract
This contract handles message transaction proofs without handling message content itself. Messages are encrypted and stored off-chain, while the blockchain logs commitments and acknowledgments. This design preserves user privacy, enables delivery verification, and avoids excessive blockchain storage and gas costs.

##### Send Message Commitment
```solidity
function sendMessageCommitment(messageHash, receiverDID)
```
This function logs a cryptographic commitment of the encrypted message on-chain. The actual message is stored off-chain (e.g., IPFS). The on-chain hash proves a message was sent to the correct identity without revealing message content.

##### Acknowledge Message
```solidity
function acknowledgeMessage(messageHash)
```
This function allows the receiver of a message to confirm they have received and decrypted the message associated with the given hash. This acknowledgment is stored on-chain, providing a verifiable proof of delivery and preventing disputes about whether communication occurred.

##### Log Message Sent
```solidity
event MessageSent(senderDID, receiverDID, messageHash, timestamp);
```
This event is emitted when a message commitment is recorded. It confirms that an encrypted message has been sent to the intended DID while preserving privacy, since only a cryptographic hash is revealed and not the message contents.

##### Log Message Acknowledged
```solidity
event MessageAcknowledged(receiverDID, messageHash, timestamp);
```
This event is emitted when a receiver confirms message retrieval. It creates a transparent and immutable record of message receipt, allowing both parties to prove communication occurred without exposing message content.
