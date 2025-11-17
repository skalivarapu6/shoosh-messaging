import { expect } from "chai";
import { ethers } from "hardhat";
import { CredentialManager } from "../typechain-types";

describe("ContractManager (TypeScript Tests)", function () {
    let cm: CredentialManager;
    let issuer: any, attacker: any;

    beforeEach(async () => {
        [issuer, attacker] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("CredentialManager");
        cm = (await Factory.deploy()) as CredentialManager;
        await cm.waitForDeployment();
    });

    const makeHash = (txt: string) => ethers.keccak256(ethers.toUtf8Bytes(txt));

    it("should register a credential", async () => {
        const credentialHash = makeHash("credential-1");

        const tx = await cm.connect(issuer).registerCredential(credentialHash);
        const receipt = await tx.wait();

        const ev = receipt!.logs
            .map((l) => {
                try { return cm.interface.parseLog(l); } catch { return undefined; }
            })
            .find((e) => e?.name === "CredentialRegistered");

        expect(ev).to.not.be.undefined;
        expect(ev!.args.credentialHash).to.equal(credentialHash);
        expect(ev!.args.issuer).to.equal(issuer.address);

        const [storedIssuer, active, issuedAt, revokedAt, exists] =
            await cm.getCredentialStatus(credentialHash);

        expect(storedIssuer).to.equal(issuer.address);
        expect(active).to.equal(true);
        expect(exists).to.equal(true);
        expect(issuedAt).to.be.greaterThan(0);
        expect(revokedAt).to.equal(0);
    });

    it("should reject duplicate credential registration", async () => {
        const credentialHash = makeHash("duplicate-test");

        await cm.connect(issuer).registerCredential(credentialHash);

        await expect(cm.connect(issuer).registerCredential(credentialHash))
            .to.be.revertedWith("Credential: already registered");
    });

    it("should revoke a credential", async () => {
        const credentialHash = makeHash("revocable-cred");
        await cm.connect(issuer).registerCredential(credentialHash);

        const tx = await cm.connect(issuer).revokeCredential(credentialHash);
        const receipt = await tx.wait();

        const ev = receipt!.logs
            .map((l) => {
                try { return cm.interface.parseLog(l); } catch { return undefined; }
            })
            .find((e) => e?.name === "CredentialRevoked");

        expect(ev).to.not.be.undefined;
        expect(ev!.args.credentialHash).to.equal(credentialHash);

        const [storedIssuer, active, issuedAt, revokedAt, exists] = await cm.getCredentialStatus(credentialHash);

        expect(active).to.equal(false);
        expect(revokedAt).to.be.greaterThan(0);
    });

    it("should prevent revocation from non-issuer", async () => {
        const credentialHash = makeHash("protected-cred");

        await cm.connect(issuer).registerCredential(credentialHash);

        await expect(cm.connect(attacker).revokeCredential(credentialHash))
            .to.be.revertedWith("Credential: not issuer");
    });

    it("should prevent revoking an unregistered credential", async () => {
        const credentialHash = makeHash("non-existent");

        await expect(cm.connect(issuer).revokeCredential(credentialHash))
            .to.be.revertedWith("Credential: not registered");
    });

    it("should prevent double revocation", async () => {
        const credentialHash = makeHash("double-revoke");
        await cm.connect(issuer).registerCredential(credentialHash);
        await cm.connect(issuer).revokeCredential(credentialHash);

        await expect(
            cm.connect(issuer).revokeCredential(credentialHash)
        ).to.be.revertedWith("Credential: already revoked");
    });

    it("verifyCredential should return true only for active credentials", async () => {
        const credentialHash = makeHash("verify-test");

        expect(await cm.verifyCredential(credentialHash)).to.equal(false);

        await cm.connect(issuer).registerCredential(credentialHash);
        expect(await cm.verifyCredential(credentialHash)).to.equal(true);

        await cm.connect(issuer).revokeCredential(credentialHash);
        expect(await cm.verifyCredential(credentialHash)).to.equal(false);
    });

    it("should return full status for registered credentials", async () => {
        const credentialHash = makeHash("full-read");

        await cm.connect(issuer).registerCredential(credentialHash);

        const [storedIssuer, active, issuedAt, revokedAt, exists] = await cm.getCredentialStatus(credentialHash);

        expect(storedIssuer).to.equal(issuer.address);
        expect(active).to.equal(true);
        expect(exists).to.equal(true);
        expect(issuedAt).to.be.greaterThan(0);
        expect(revokedAt).to.equal(0);
    });

    it("should show exists=false for non-registered credentials", async () => {
        const credentialHash = makeHash("ghost");
        const status = await cm.getCredentialStatus(credentialHash);
        expect(status[4]).to.equal(false);
    });
});