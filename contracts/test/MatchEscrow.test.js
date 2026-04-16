const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("MatchEscrow", function () {
  const ENTRY_FEE = ethers.parseUnits("5", 6); // 5 USDC
  const SEVEN_DAYS = 7 * 24 * 60 * 60;
  const THIRTY_DAYS = 30 * 24 * 60 * 60;

  async function deployFixture() {
    const [owner, manager, agent1Wallet, agent2Wallet, feeRecipient] = await ethers.getSigners();

    // Deploy mock USDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();

    // Deploy MatchEscrow
    const MatchEscrow = await ethers.getContractFactory("MatchEscrow");
    const escrow = await MatchEscrow.deploy(
      await usdc.getAddress(),
      feeRecipient.address
    );

    // Authorize manager
    await escrow.setManager(manager.address, true);

    // Mint USDC to agents
    await usdc.mint(agent1Wallet.address, ethers.parseUnits("1000", 6));
    await usdc.mint(agent2Wallet.address, ethers.parseUnits("1000", 6));

    // Approve escrow
    await usdc.connect(agent1Wallet).approve(await escrow.getAddress(), ethers.MaxUint256);
    await usdc.connect(agent2Wallet).approve(await escrow.getAddress(), ethers.MaxUint256);

    return { escrow, usdc, owner, manager, agent1Wallet, agent2Wallet, feeRecipient };
  }

  async function createAndFundMatch(escrow, manager, agent1Wallet, agent2Wallet) {
    const matchId = ethers.keccak256(ethers.toUtf8Bytes("test-match-1"));

    await escrow.connect(manager).createMatch(
      matchId,
      1, // agent1Id
      2, // agent2Id
      agent1Wallet.address,
      agent2Wallet.address,
      ENTRY_FEE
    );

    await escrow.connect(agent1Wallet).fundMatch(matchId, 1);
    await escrow.connect(agent2Wallet).fundMatch(matchId, 2);

    return matchId;
  }

  describe("Match Creation", function () {
    it("should create a match", async function () {
      const { escrow, manager, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = ethers.keccak256(ethers.toUtf8Bytes("test-match-1"));

      await expect(
        escrow.connect(manager).createMatch(
          matchId,
          1,
          2,
          agent1Wallet.address,
          agent2Wallet.address,
          ENTRY_FEE
        )
      ).to.emit(escrow, "MatchCreated")
        .withArgs(matchId, 1, 2, ENTRY_FEE);

      const match = await escrow.getMatch(matchId);
      expect(match.agent1Id).to.equal(1);
      expect(match.agent2Id).to.equal(2);
      expect(match.entryFee).to.equal(ENTRY_FEE);
      expect(match.status).to.equal(0); // Created
    });

    it("should not allow duplicate match IDs", async function () {
      const { escrow, manager, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = ethers.keccak256(ethers.toUtf8Bytes("test-match-1"));

      await escrow.connect(manager).createMatch(
        matchId, 1, 2, agent1Wallet.address, agent2Wallet.address, ENTRY_FEE
      );

      await expect(
        escrow.connect(manager).createMatch(
          matchId, 1, 2, agent1Wallet.address, agent2Wallet.address, ENTRY_FEE
        )
      ).to.be.revertedWithCustomError(escrow, "MatchExists");
    });

    it("should not allow same agent to play itself", async function () {
      const { escrow, manager, agent1Wallet } = await loadFixture(deployFixture);

      const matchId = ethers.keccak256(ethers.toUtf8Bytes("test-match-1"));

      await expect(
        escrow.connect(manager).createMatch(
          matchId, 1, 1, agent1Wallet.address, agent1Wallet.address, ENTRY_FEE
        )
      ).to.be.revertedWithCustomError(escrow, "InvalidAgent");
    });
  });

  describe("Match Funding", function () {
    it("should allow agents to fund match", async function () {
      const { escrow, usdc, manager, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = ethers.keccak256(ethers.toUtf8Bytes("test-match-1"));
      await escrow.connect(manager).createMatch(
        matchId, 1, 2, agent1Wallet.address, agent2Wallet.address, ENTRY_FEE
      );

      const balanceBefore = await usdc.balanceOf(agent1Wallet.address);

      await expect(escrow.connect(agent1Wallet).fundMatch(matchId, 1))
        .to.emit(escrow, "MatchFunded")
        .withArgs(matchId, 1, ENTRY_FEE);

      const balanceAfter = await usdc.balanceOf(agent1Wallet.address);
      expect(balanceBefore - balanceAfter).to.equal(ENTRY_FEE);
    });

    it("should update status to Funded when both fund", async function () {
      const { escrow, manager, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = await createAndFundMatch(escrow, manager, agent1Wallet, agent2Wallet);

      const match = await escrow.getMatch(matchId);
      expect(match.status).to.equal(1); // Funded
      expect(match.agent1Funded).to.be.true;
      expect(match.agent2Funded).to.be.true;
    });

    it("should not allow double funding", async function () {
      const { escrow, manager, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = ethers.keccak256(ethers.toUtf8Bytes("test-match-1"));
      await escrow.connect(manager).createMatch(
        matchId, 1, 2, agent1Wallet.address, agent2Wallet.address, ENTRY_FEE
      );

      await escrow.connect(agent1Wallet).fundMatch(matchId, 1);

      await expect(
        escrow.connect(agent1Wallet).fundMatch(matchId, 1)
      ).to.be.revertedWithCustomError(escrow, "AlreadyFunded");
    });
  });

  describe("Prize Distribution", function () {
    it("should distribute prize to winner", async function () {
      const { escrow, usdc, manager, agent1Wallet, agent2Wallet, feeRecipient } = await loadFixture(deployFixture);

      const matchId = await createAndFundMatch(escrow, manager, agent1Wallet, agent2Wallet);

      await escrow.connect(manager).startMatch(matchId);
      await escrow.connect(manager).completeMatch(matchId);

      const agent1BalanceBefore = await usdc.balanceOf(agent1Wallet.address);
      const feeRecipientBefore = await usdc.balanceOf(feeRecipient.address);

      // Agent 1 wins
      await escrow.connect(manager).distributeWinnings(matchId, 1);

      const agent1BalanceAfter = await usdc.balanceOf(agent1Wallet.address);
      const feeRecipientAfter = await usdc.balanceOf(feeRecipient.address);

      // Prize pool = 10 USDC, platform fee = 2.5% = 0.25 USDC
      const expectedPrize = ethers.parseUnits("9.75", 6);
      const expectedFee = ethers.parseUnits("0.25", 6);

      expect(agent1BalanceAfter - agent1BalanceBefore).to.equal(expectedPrize);
      expect(feeRecipientAfter - feeRecipientBefore).to.equal(expectedFee);
    });

    it("should split prize on draw", async function () {
      const { escrow, usdc, manager, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = await createAndFundMatch(escrow, manager, agent1Wallet, agent2Wallet);

      await escrow.connect(manager).startMatch(matchId);
      await escrow.connect(manager).completeMatch(matchId);

      const agent1BalanceBefore = await usdc.balanceOf(agent1Wallet.address);
      const agent2BalanceBefore = await usdc.balanceOf(agent2Wallet.address);

      // Draw (winnerId = 0)
      await escrow.connect(manager).distributeWinnings(matchId, 0);

      const agent1BalanceAfter = await usdc.balanceOf(agent1Wallet.address);
      const agent2BalanceAfter = await usdc.balanceOf(agent2Wallet.address);

      // Each gets half of (10 - 0.25) = 4.875 USDC
      const expectedHalf = ethers.parseUnits("4.875", 6);

      expect(agent1BalanceAfter - agent1BalanceBefore).to.be.closeTo(expectedHalf, 1);
      expect(agent2BalanceAfter - agent2BalanceBefore).to.be.closeTo(expectedHalf, 1);
    });

    it("should not allow double settlement", async function () {
      const { escrow, manager, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = await createAndFundMatch(escrow, manager, agent1Wallet, agent2Wallet);

      await escrow.connect(manager).startMatch(matchId);
      await escrow.connect(manager).completeMatch(matchId);
      await escrow.connect(manager).distributeWinnings(matchId, 1);

      await expect(
        escrow.connect(manager).distributeWinnings(matchId, 1)
      ).to.be.revertedWithCustomError(escrow, "InvalidStatus");
    });
  });

  describe("Disputes", function () {
    it("should allow participant to dispute", async function () {
      const { escrow, manager, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = await createAndFundMatch(escrow, manager, agent1Wallet, agent2Wallet);

      await escrow.connect(manager).startMatch(matchId);
      await escrow.connect(manager).completeMatch(matchId);

      await expect(escrow.connect(agent1Wallet).disputeMatch(matchId))
        .to.emit(escrow, "MatchDisputed")
        .withArgs(matchId);

      const match = await escrow.getMatch(matchId);
      expect(match.status).to.equal(6); // Disputed
    });

    it("should not allow non-participant to dispute", async function () {
      const { escrow, manager, agent1Wallet, agent2Wallet, owner } = await loadFixture(deployFixture);

      const matchId = await createAndFundMatch(escrow, manager, agent1Wallet, agent2Wallet);

      await escrow.connect(manager).startMatch(matchId);
      await escrow.connect(manager).completeMatch(matchId);

      await expect(
        escrow.connect(owner).disputeMatch(matchId)
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
    });

    it("should allow owner to resolve dispute", async function () {
      const { escrow, usdc, manager, agent1Wallet, agent2Wallet, owner } = await loadFixture(deployFixture);

      const matchId = await createAndFundMatch(escrow, manager, agent1Wallet, agent2Wallet);

      await escrow.connect(manager).startMatch(matchId);
      await escrow.connect(manager).completeMatch(matchId);
      await escrow.connect(agent1Wallet).disputeMatch(matchId);

      await expect(escrow.connect(owner).resolveDispute(matchId, 2))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(matchId, 2);

      const match = await escrow.getMatch(matchId);
      expect(match.status).to.equal(5); // Settled
    });

    it("should auto-resolve timed out disputes", async function () {
      const { escrow, usdc, manager, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = await createAndFundMatch(escrow, manager, agent1Wallet, agent2Wallet);

      await escrow.connect(manager).startMatch(matchId);
      await escrow.connect(manager).completeMatch(matchId);
      await escrow.connect(agent1Wallet).disputeMatch(matchId);

      // Fast forward 7 days
      await time.increase(SEVEN_DAYS + 1);

      const agent1Before = await usdc.balanceOf(agent1Wallet.address);
      const agent2Before = await usdc.balanceOf(agent2Wallet.address);

      await escrow.resolveTimedOutDispute(matchId);

      const agent1After = await usdc.balanceOf(agent1Wallet.address);
      const agent2After = await usdc.balanceOf(agent2Wallet.address);

      // Both should receive roughly half
      expect(agent1After - agent1Before).to.be.gt(0);
      expect(agent2After - agent2Before).to.be.gt(0);
    });

    it("should not allow early timeout resolution", async function () {
      const { escrow, manager, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = await createAndFundMatch(escrow, manager, agent1Wallet, agent2Wallet);

      await escrow.connect(manager).startMatch(matchId);
      await escrow.connect(manager).completeMatch(matchId);
      await escrow.connect(agent1Wallet).disputeMatch(matchId);

      // Only 1 day passed
      await time.increase(24 * 60 * 60);

      await expect(
        escrow.resolveTimedOutDispute(matchId)
      ).to.be.revertedWithCustomError(escrow, "DisputeNotTimedOut");
    });
  });

  describe("Emergency Withdrawal", function () {
    it("should allow emergency withdrawal after 30 days", async function () {
      const { escrow, usdc, manager, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = await createAndFundMatch(escrow, manager, agent1Wallet, agent2Wallet);

      // Fast forward 30 days
      await time.increase(THIRTY_DAYS + 1);

      const balanceBefore = await usdc.balanceOf(agent1Wallet.address);

      await escrow.connect(agent1Wallet).emergencyWithdraw(matchId);

      const balanceAfter = await usdc.balanceOf(agent1Wallet.address);
      expect(balanceAfter - balanceBefore).to.equal(ENTRY_FEE);
    });

    it("should not allow early emergency withdrawal", async function () {
      const { escrow, manager, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = await createAndFundMatch(escrow, manager, agent1Wallet, agent2Wallet);

      // Only 10 days passed
      await time.increase(10 * 24 * 60 * 60);

      await expect(
        escrow.connect(agent1Wallet).emergencyWithdraw(matchId)
      ).to.be.revertedWithCustomError(escrow, "MatchNotStale");
    });
  });

  describe("Refunds", function () {
    it("should refund both agents on cancel", async function () {
      const { escrow, usdc, manager, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = await createAndFundMatch(escrow, manager, agent1Wallet, agent2Wallet);

      const agent1Before = await usdc.balanceOf(agent1Wallet.address);
      const agent2Before = await usdc.balanceOf(agent2Wallet.address);

      await escrow.connect(manager).refundMatch(matchId);

      const agent1After = await usdc.balanceOf(agent1Wallet.address);
      const agent2After = await usdc.balanceOf(agent2Wallet.address);

      expect(agent1After - agent1Before).to.equal(ENTRY_FEE);
      expect(agent2After - agent2Before).to.equal(ENTRY_FEE);
    });
  });

  describe("Platform Fee", function () {
    it("should allow owner to update platform fee", async function () {
      const { escrow, owner } = await loadFixture(deployFixture);

      await expect(escrow.connect(owner).setPlatformFee(500)) // 5%
        .to.emit(escrow, "PlatformFeeUpdated")
        .withArgs(250, 500);

      expect(await escrow.platformFeeBps()).to.equal(500);
    });

    it("should not allow fee above 10%", async function () {
      const { escrow, owner } = await loadFixture(deployFixture);

      await expect(
        escrow.connect(owner).setPlatformFee(1001)
      ).to.be.revertedWithCustomError(escrow, "FeeTooHigh");
    });
  });
});
