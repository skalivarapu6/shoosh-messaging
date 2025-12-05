// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract MessageMetadata {
    struct MessageInfo {
        string senderDID;
        string receiverDID;
        uint256 timestamp;
        bool acknowledged;
        bool exists;
    }

    mapping(bytes32 => MessageInfo) private _messages;

    event MessageSent(bytes32 indexed messageHash, string senderDID, string receiverDID, string ipfsCid, uint256 timestamp);
    event MessageAcknowledged(bytes32 indexed messageHash, string receiverDID, uint256 timestamp);

    function sendMessageCommitment(bytes32 messageHash, string calldata receiverDID, string calldata ipfsCid) external {
        require(messageHash != bytes32(0), "Message: empty hash");
        require(!_messages[messageHash].exists, "Message: already exists");
        require(bytes(receiverDID).length > 0, "Message: empty receiver DID");
        require(bytes(ipfsCid).length > 0, "Message: empty IPFS CID");

        string memory senderDID = _toDidString(msg.sender);

        _messages[messageHash] = MessageInfo({
            senderDID: senderDID,
            receiverDID: receiverDID,
            timestamp: block.timestamp,
            acknowledged: false,
            exists: true
        });

        emit MessageSent(
            messageHash,
            senderDID,
            receiverDID,
            ipfsCid,
            block.timestamp
        );
    }

    function acknowledgeMessage(bytes32 messageHash) external {
        MessageInfo storage msgInfo = _messages[messageHash];

        require(msgInfo.exists, "Message: does not exist");
        require(!msgInfo.acknowledged, "Message: already acknowledged");

        string memory callerDid = _toDidString(msg.sender);
        require(
            keccak256(bytes(msgInfo.receiverDID)) == keccak256(bytes(callerDid)),
            "Message: caller is not receiver"
        );

        msgInfo.acknowledged = true;

        emit MessageAcknowledged(
            messageHash,
            msgInfo.receiverDID,
            block.timestamp
        );
    }

    function getMessageInfo(bytes32 messageHash) external view returns (
            string memory senderDID,
            string memory receiverDID,
            uint256 timestamp,
            bool acknowledged,
            bool exists
        )
    {
        MessageInfo storage m = _messages[messageHash];
        return (m.senderDID, m.receiverDID, m.timestamp, m.acknowledged, m.exists);
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
