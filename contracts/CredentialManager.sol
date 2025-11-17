// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract CredentialManager {
    struct CredentialStatus {
        address issuer;
        bool active;
        uint256 issuedAt;
        uint256 revokedAt;
        bool exists;
    }

    mapping(bytes32 => CredentialStatus) private _credentials;

    event CredentialRegistered(bytes32 indexed credentialHash, address indexed issuer, uint256 issuedAt);
    event CredentialRevoked(bytes32 indexed credentialHash, address indexed issuer, uint256 revokedAt);

    function registerCredential(bytes32 credentialHash) external {
        require(credentialHash != bytes32(0), "Credential: empty hash");
        require(!_credentials[credentialHash].exists, "Credential: already registered");

        _credentials[credentialHash] = CredentialStatus({
            issuer: msg.sender,
            active: true,
            issuedAt: block.timestamp,
            revokedAt: 0,
            exists: true
        });

        emit CredentialRegistered(credentialHash, msg.sender, block.timestamp);
    }

    function revokeCredential(bytes32 credentialHash) external {
        CredentialStatus storage cred = _credentials[credentialHash];

        require(cred.exists, "Credential: not registered");
        require(cred.issuer == msg.sender, "Credential: not issuer");
        require(cred.active, "Credential: already revoked");

        cred.active = false;
        cred.revokedAt = block.timestamp;

        emit CredentialRevoked(credentialHash, msg.sender, block.timestamp);
    }

    function verifyCredential(bytes32 credentialHash) external view returns (bool valid) {
        CredentialStatus storage cred = _credentials[credentialHash];
        return cred.exists && cred.active;
    }

    function getCredentialStatus(bytes32 credentialHash) external view returns (
            address issuer,
            bool active,
            uint256 issuedAt,
            uint256 revokedAt,
            bool exists
        )
    {
        CredentialStatus storage cred = _credentials[credentialHash];
        return (cred.issuer, cred.active, cred.issuedAt, cred.revokedAt, cred.exists);
    }
}
