import { expect } from "chai";
import { ethers } from "hardhat";
import { MessageMetadata } from "../typechain-types";

describe("MessageMetadata (TypeScript Tests)", () => {
    let mm: MessageMetadata;
    let sender: any, receiver: any, attacker: any;

    beforeEach(async () => {
        [sender, receiver, attacker] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("MessageMetadata");
        mm = (await Factory.deploy()) as MessageMetadata;
        await mm.waitForDeployment();
    });

    const didFor = (addr: string) => `did:eth:${addr.toLowerCase()}`;
    const hash = (txt: string) => ethers.keccak256(ethers.toUtf8Bytes(txt));

    it("should commit a new message", async () => {
        const messageHash = hash("hello world");
        const receiverDID = didFor(receiver.address);

        const tx = await mm.connect(sender).sendMessageCommitment(
            messageHash,
            receiverDID
        );
        const receipt = await tx.wait();

        const ev = receipt!.logs
            .map(log => {
                try { return mm.interface.parseLog(log); } catch { return undefined; }
            })
            .find(e => e?.name === "MessageSent");

        expect(ev).to.not.be.undefined;
        expect(ev!.args.messageHash).to.equal(messageHash);
        expect(ev!.args.receiverDID).to.equal(receiverDID);

        const info = await mm.getMessageInfo(messageHash);
        expect(info.exists).to.equal(true);
        expect(info.senderDID).to.equal(didFor(sender.address));
        expect(info.receiverDID).to.equal(receiverDID);
        expect(info.acknowledged).to.equal(false);
        expect(info.timestamp).to.be.greaterThan(0);
    });

    it("should prevent duplicate message commitment", async () => {
        const messageHash = hash("duplicate");

        await mm.connect(sender).sendMessageCommitment(messageHash, didFor(receiver.address));
        await expect(
            mm.connect(sender).sendMessageCommitment(
                messageHash,
                didFor(receiver.address)
            )
        ).to.be.revertedWith("Message: already exists");
    });

    it("should allow the receiver to acknowledge a message", async () => {
        const messageHash = hash("ack-test");
        const receiverDID = didFor(receiver.address);

        await mm.connect(sender).sendMessageCommitment(messageHash, receiverDID);

        const tx = await mm.connect(receiver).acknowledgeMessage(messageHash);
        const receipt = await tx.wait();

        const ev = receipt!.logs
            .map(log => {
                try { return mm.interface.parseLog(log); } catch { return undefined; }
            })
            .find(e => e?.name === "MessageAcknowledged");

        expect(ev).to.not.be.undefined;
        expect(ev!.args.messageHash).to.equal(messageHash);

        const info = await mm.getMessageInfo(messageHash);
        expect(info.acknowledged).to.equal(true);
    });

    it("should prevent acknowledgment by non-receiver", async () => {
        const messageHash = hash("attack-attempt");
        await mm.connect(sender).sendMessageCommitment(messageHash, didFor(receiver.address));
        await expect(mm.connect(attacker).acknowledgeMessage(messageHash))
            .to.be.revertedWith("Message: caller is not receiver");
    });

    it("should prevent acknowledgment of non-existent message", async () => {
        const messageHash = hash("ghost-message");
        await expect(mm.connect(receiver).acknowledgeMessage(messageHash))
            .to.be.revertedWith("Message: does not exist");
    });

    it("should prevent double acknowledgment", async () => {
        const messageHash = hash("double-ack");
        await mm.connect(sender).sendMessageCommitment(messageHash,didFor(receiver.address));
        await mm.connect(receiver).acknowledgeMessage(messageHash);
        await expect(mm.connect(receiver).acknowledgeMessage(messageHash))
            .to.be.revertedWith("Message: already acknowledged");
    });

    it("should return full metadata for message", async () => {
        const messageHash = hash("metadata-check");
        const receiverDID = didFor(receiver.address);

        await mm.connect(sender).sendMessageCommitment(messageHash, receiverDID);

        const [senderDID, storedReceiverDID, timestamp, acknowledged, exists] = await mm.getMessageInfo(messageHash);

        expect(exists).to.equal(true);
        expect(senderDID).to.equal(didFor(sender.address));
        expect(storedReceiverDID).to.equal(receiverDID);
        expect(timestamp).to.be.greaterThan(0);
        expect(acknowledged).to.equal(false);
    });

    it("should show exists=false for unknown message", async () => {
        const messageHash = hash("invisible");
        const info = await mm.getMessageInfo(messageHash);
        expect(info.exists).to.equal(false);
    });
});
