export const DIDRegistryAddress = "";

export const DIDRegistryABI = [
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "string",
				"name": "did",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "oldController",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "newController",
				"type": "address"
			}
		],
		"name": "ControllerRotated",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "string",
				"name": "did",
				"type": "string"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "controller",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "didDocumentHash",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			}
		],
		"name": "DIDRegistered",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "string",
				"name": "did",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "newEndpoint",
				"type": "string"
			}
		],
		"name": "DIDUpdated",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "string",
				"name": "did",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "bytes",
				"name": "oldKey",
				"type": "bytes"
			},
			{
				"indexed": false,
				"internalType": "bytes",
				"name": "newKey",
				"type": "bytes"
			}
		],
		"name": "KeyRotated",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "did",
				"type": "string"
			}
		],
		"name": "exists",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "did",
				"type": "string"
			}
		],
		"name": "getDID",
		"outputs": [
			{
				"components": [
					{
						"internalType": "address",
						"name": "controller",
						"type": "address"
					},
					{
						"internalType": "string",
						"name": "didDocumentHash",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "serviceEndpoint",
						"type": "string"
					},
					{
						"internalType": "bytes",
						"name": "publicKey",
						"type": "bytes"
					},
					{
						"internalType": "bool",
						"name": "exists",
						"type": "bool"
					}
				],
				"internalType": "struct DIDRegistry.DID",
				"name": "",
				"type": "tuple"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "controller",
				"type": "address"
			},
			{
				"internalType": "string",
				"name": "didDocumentHash",
				"type": "string"
			}
		],
		"name": "registerDID",
		"outputs": [
			{
				"internalType": "string",
				"name": "did",
				"type": "string"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "newController",
				"type": "address"
			}
		],
		"name": "rotateController",
		"outputs": [
			{
				"internalType": "string",
				"name": "did",
				"type": "string"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes",
				"name": "newKey",
				"type": "bytes"
			}
		],
		"name": "rotateKey",
		"outputs": [
			{
				"internalType": "string",
				"name": "did",
				"type": "string"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "newEndpoint",
				"type": "string"
			}
		],
		"name": "updateServiceEndpoint",
		"outputs": [
			{
				"internalType": "string",
				"name": "did",
				"type": "string"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	}
];
