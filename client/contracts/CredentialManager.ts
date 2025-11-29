export const CredentialManagerAddress = "";

export const CredentialManagerABI = [
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "credentialHash",
				"type": "bytes32"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "issuer",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "issuedAt",
				"type": "uint256"
			}
		],
		"name": "CredentialRegistered",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "credentialHash",
				"type": "bytes32"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "issuer",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "revokedAt",
				"type": "uint256"
			}
		],
		"name": "CredentialRevoked",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "credentialHash",
				"type": "bytes32"
			}
		],
		"name": "getCredentialStatus",
		"outputs": [
			{
				"internalType": "address",
				"name": "issuer",
				"type": "address"
			},
			{
				"internalType": "bool",
				"name": "active",
				"type": "bool"
			},
			{
				"internalType": "uint256",
				"name": "issuedAt",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "revokedAt",
				"type": "uint256"
			},
			{
				"internalType": "bool",
				"name": "exists",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "credentialHash",
				"type": "bytes32"
			}
		],
		"name": "registerCredential",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "credentialHash",
				"type": "bytes32"
			}
		],
		"name": "revokeCredential",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "credentialHash",
				"type": "bytes32"
			}
		],
		"name": "verifyCredential",
		"outputs": [
			{
				"internalType": "bool",
				"name": "valid",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];