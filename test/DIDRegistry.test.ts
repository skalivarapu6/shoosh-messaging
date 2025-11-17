import { expect } from "chai";
import { ethers } from "hardhat";
import { DIDRegistry } from "../typechain-types";

describe("DIDRegistry (TypeScript Tests)", function () {
    let registry: DIDRegistry;
    let owner: any, user1: any, user2: any;

    beforeEach(async () => {
        [owner, user1, user2] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("DIDRegistry");
        registry = (await Factory.deploy()) as DIDRegistry;
        await registry.waitForDeployment();
    });

    const didFor = (addr: string): string =>
        `did:eth:${addr.toLowerCase()}`;

    it("should register a DID", async () => {
        const hash = "QmTestHash123";

        const tx = await registry.registerDID(user1.address, hash);
        const receipt = await tx.wait();

        const did = didFor(user1.address);

        const event = receipt!.logs
            .map((log) => registry.interface.parseLog(log))
            .find((e) => e?.name === "DIDRegistered");

        expect(event).to.not.be.undefined;

        expect(event!.args.did).to.equal(did);
        expect(event!.args.controller).to.equal(user1.address);

        const stored = await registry.getDID(did);
        expect(stored.controller).to.equal(user1.address);
        expect(stored.didDocumentHash).to.equal(hash);
        expect(stored.exists).to.equal(true);
    });

    it("should reject duplicate registration", async () => {
        const hash = "hash1";
        await registry.registerDID(user1.address, hash);
        await expect(registry.registerDID(user1.address, "hash2"))
            .to.be.revertedWith("DID already registered");
    });

    it("should update service endpoint", async () => {
        const did = didFor(user1.address);
        await registry.registerDID(user1.address, "hash");
        await registry.connect(user1).updateServiceEndpoint("https://example.com");
        const stored = await registry.getDID(did);
        expect(stored.serviceEndpoint).to.equal("https://example.com");
    });

    it("should prevent unauthorized endpoint update", async () => {
        await registry.registerDID(user1.address, "hash");
        await expect(registry.connect(user2).updateServiceEndpoint("https://pwn.com"))
            .to.be.revertedWith("DID not registered");
    });

    it("should rotate controller", async () => {
        const did = didFor(user1.address);
        await registry.registerDID(user1.address, "hash");
        await registry.connect(user1).rotateController(user2.address);
        const stored = await registry.getDID(did);
        expect(stored.controller).to.equal(user2.address);
    });

    it("should block unauthorized controller rotation", async () => {
        await registry.registerDID(user1.address, "hash");
        await expect(registry.connect(user2).rotateController(user2.address))
            .to.be.revertedWith("DID not registered");
    });

    it("should rotate the DID public key", async () => {
        const did = didFor(user1.address);
        await registry.registerDID(user1.address, "hash");
        const newKey = ethers.toUtf8Bytes("newPublicKey123");
        await registry.connect(user1).rotateKey(newKey);
        const stored = await registry.getDID(did);
        expect(ethers.toUtf8String(stored.publicKey)).to.equal("newPublicKey123");
    });

    it("should generate a valid DID string", async () => {
        const did = didFor(owner.address);
        await registry.registerDID(owner.address, "hash");
        const stored = await registry.getDID(did);
        expect(stored.exists).to.equal(true);
    });
});
