// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract DIDRegistry {
    struct DID {
        address controller;
        string didDocumentHash;
        string serviceEndpoint;
        bytes publicKey; 
        bool exists;
    }

    mapping(string => DID) private _dids;

    event DIDRegistered(string did, address indexed controller, string didDocumentHash, uint256 timestamp);
    event DIDUpdated(string indexed did, string newEndpoint);
    event ControllerRotated(string indexed did, address oldController, address newController);
    event KeyRotated(string indexed did, bytes oldKey, bytes newKey);

    function registerDID(address controller, string memory didDocumentHash) external returns (string memory did) {
        did = _toDidString(controller);
        require(!_dids[did].exists, "DID already registered");
        require(bytes(didDocumentHash).length > 0, "Empty DID document hash");

        _dids[did] = DID({
            controller: controller,
            didDocumentHash: didDocumentHash,
            serviceEndpoint: "",
            publicKey: "",
            exists: true
        });

        emit DIDRegistered(did, controller, didDocumentHash, block.timestamp);
    }

    function updateServiceEndpoint(string calldata newEndpoint) external returns (string memory did) {
        did = _toDidString(msg.sender);

        require(_dids[did].exists, "DID not registered");
        require(_dids[did].controller == msg.sender, "Not controller");

        _dids[did].serviceEndpoint = newEndpoint;

        emit DIDUpdated(did, newEndpoint);
    }

    function rotateController(address newController) external returns (string memory did) {
        did = _toDidString(msg.sender);

        require(_dids[did].exists, "DID not registered");
        require(_dids[did].controller == msg.sender, "Not controller");
        require(newController != address(0), "Zero address");

        address old = msg.sender;
        _dids[did].controller = newController;

        emit ControllerRotated(did, old, newController);
    }

    function rotateKey(bytes calldata newKey) external returns (string memory did){
        did = _toDidString(msg.sender);

        require(_dids[did].exists, "DID not registered");
        require(_dids[did].controller == msg.sender, "Not controller");

        bytes memory oldKey = _dids[did].publicKey;
        _dids[did].publicKey = newKey;

        emit KeyRotated(did, oldKey, newKey);
    }


    function exists(string memory did) external view returns (bool) {
        return _dids[did].exists;
    }

    function getDID(string memory did) external view returns (DID memory) {
        require(_dids[did].exists, "DID not registered");
        return _dids[did];
    }

    function _toDidString(address controller) internal pure returns (string memory) {
        return string(abi.encodePacked("did:eth:", _addressToHex(controller)));
    }

    function _addressToHex(address a) internal pure returns (string memory) {
        bytes20 value = bytes20(uint160(a));
        bytes16 hexChars = "0123456789abcdef";
        bytes memory str = new bytes(42);

        str[0] = "0";
        str[1] = "x";

        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2] = hexChars[uint8(value[i] >> 4)];
            str[3 + i * 2] = hexChars[uint8(value[i] & 0x0f)];
        }

        return string(str);
    }
}
