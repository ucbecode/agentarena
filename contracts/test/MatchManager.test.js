const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("MatchManager", function () {
  const ENTRY_FEE = ethers.parseUnits("5", 6);
  const MATCH_DURATION = 900; // 15 minutes
  const CHALLENGE_TIMEOUT = 300; // 5 minutes

  async function deployFixture() {
    const [owner, oracle, agent1Wallet, agent2Wallet, feeRecipient] = await ethers.getSigners();

    // Deploy mock contracts
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();

    const MockIdentityRegistry = await ethers.getContractFactory("MockIdentityRegistry");
    const identityRegistry = await MockIdentityRegistry.deploy();

    // Register agents
    await identityRegistry.registerAgent(agent1Wallet.address, 1);
    await identityRegistry.registerAgent(agent2Wallet.address, 2);

    // Deploy ArenaRegistry
    const ArenaRegistry = await ethers.getContractFactory("ArenaRegistry");
    const arenaRegistry = await ArenaRegistry.deploy(await identityRegistry.getAddress());

    // Register agents for arena
    await arenaRegistry.connect(agent1Wallet).registerForArena(1, "https://agent1.com");
    await arenaRegistry.connect(agent2Wallet).registerForArena(2, "https://agent2.com");

    // Deploy MatchEscrow
    const MatchEscrow = await ethers.getContractFactory("MatchEscrow");
    const escrow = await MatchEscrow.deploy(await usdc.getAddress(), feeRecipient.address);

    // Deploy MatchManager
    const MatchManager = await ethers.getContractFactory("MatchManager");
    const matchManager = await MatchManager.deploy(
      await arenaRegistry.getAddress(),
      await escrow.getAddress()
    );

    // Configure permissions
    await escrow.setManager(await matchManager.getAddress(), true);
    await arenaRegistry.setMatchManager(await matchManager.getAddress(), true);
    await matchManager.setOracle(oracle.address, true);

    // Mint and approve USDC
    await usdc.mint(agent1Wallet.address, ethers.parseUnits("1000", 6));
    await usdc.mint(agent2Wallet.address, ethers.parseUnits("1000", 6));
    await usdc.connect(agent1Wallet).approve(await escrow.getAddress(), ethers.MaxUint256);
    await usdc.connect(agent2Wallet).approve(await escrow.getAddress(), ethers.MaxUint256);

    return {
      matchManager, escrow, arenaRegistry, usdc, identityRegistry,
      owner, oracle, agent1Wallet, agent2Wallet, feeRecipient
    };
  }

  describe("Challenge Creation", function () {
    it("should create a challenge", async function () {
      const { matchManager, agent1Wallet } = await loadFixture(deployFixture);

      const tx = await matchManager.connect(agent1Wallet).createChallenge(1, 2, 0);
      const receipt = await tx.wait();

      const event = receipt.logs.find(l => l.fragment?.name === "ChallengeCreated");
      expect(event).to.not.be.undefined;

      const matchId = event.args[0];
      const state = await matchManager.getMatchState(matchId);

      expect(state.challenger).to.equal(1);
      expect(state.challenged).to.equal(2);
      expect(state.tier).to.equal(0);
      expect(state.accepted).to.be.false;
    });

    it("should not allow self-challenge", async function () {
      const { matchManager, agent1Wallet } = await loadFixture(deployFixture);

      await expect(
        matchManager.connect(agent1Wallet).createChallenge(1, 1, 0)
      ).to.be.revertedWithCustomError(matchManager, "ChallengeSelf");
    });

    it("should not allow challenge to unregistered agent", async function () {
      const { matchManager, agent1Wallet } = await loadFixture(deployFixture);

      await expect(
        matchManager.connect(agent1Wallet).createChallenge(1, 999, 0)
      ).to.be.revertedWithCustomError(matchManager, "AgentNotRegistered");
    });

    it("should not allow agent already in match to challenge", async function () {
      const { matchManager, agent1Wallet } = await loadFixture(deployFixture);

      await matchManager.connect(agent1Wallet).createChallenge(1, 2, 0);

      await expect(
        matchManager.connect(agent1Wallet).createChallenge(1, 2, 0)
      ).to.be.revertedWithCustomError(matchManager, "AgentInMatch");
    });
  });

  describe("Challenge Acceptance", function () {
    it("should accept challenge when both funded", async function () {
      const { matchManager, escrow, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const tx = await matchManager.connect(agent1Wallet).createChallenge(1, 2, 0);
      const receipt = await tx.wait();
      const matchId = receipt.logs.find(l => l.fragment?.name === "ChallengeCreated").args[0];

      // Fund both sides
      await escrow.connect(agent1Wallet).fundMatch(matchId, 1);
      await escrow.connect(agent2Wallet).fundMatch(matchId, 2);

      await expect(matchManager.acceptChallenge(matchId))
        .to.emit(matchManager, "ChallengeAccepted")
        .withArgs(matchId);

      const state = await matchManager.getMatchState(matchId);
      expect(state.accepted).to.be.true;
    });

    it("should not accept unfunded challenge", async function () {
      const { matchManager, agent1Wallet } = await loadFixture(deployFixture);

      const tx = await matchManager.connect(agent1Wallet).createChallenge(1, 2, 0);
      const receipt = await tx.wait();
      const matchId = receipt.logs.find(l => l.fragment?.name === "ChallengeCreated").args[0];

      await expect(
        matchManager.acceptChallenge(matchId)
      ).to.be.revertedWithCustomError(matchManager, "MatchNotReady");
    });

    it("should expire challenge after timeout", async function () {
      const { matchManager, agent1Wallet } = await loadFixture(deployFixture);

      const tx = await matchManager.connect(agent1Wallet).createChallenge(1, 2, 0);
      const receipt = await tx.wait();
      const matchId = receipt.logs.find(l => l.fragment?.name === "ChallengeCreated").args[0];

      // Fast forward past timeout
      await time.increase(CHALLENGE_TIMEOUT + 1);

      await expect(matchManager.cancelExpiredChallenge(matchId))
        .to.emit(matchManager, "ChallengeExpired")
        .withArgs(matchId);
    });
  });

  describe("Result Submission", function () {
    async function startMatch(matchManager, escrow, agent1Wallet, agent2Wallet) {
      const tx = await matchManager.connect(agent1Wallet).createChallenge(1, 2, 0);
      const receipt = await tx.wait();
      const matchId = receipt.logs.find(l => l.fragment?.name === "ChallengeCreated").args[0];

      await escrow.connect(agent1Wallet).fundMatch(matchId, 1);
      await escrow.connect(agent2Wallet).fundMatch(matchId, 2);
      await matchManager.acceptChallenge(matchId);

      return matchId;
    }

    it("should submit result after match ends", async function () {
      const { matchManager, escrow, oracle, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = await startMatch(matchManager, escrow, agent1Wallet, agent2Wallet);

      // Fast forward past match duration
      await time.increase(MATCH_DURATION + 1);

      const resultHash = ethers.keccak256(ethers.toUtf8Bytes("result-data"));

      await expect(
        matchManager.connect(oracle).submitResult(
          matchId,
          ethers.parseUnits("250", 6),  // Agent 1 P&L
          ethers.parseUnits("-150", 6), // Agent 2 P&L
          resultHash
        )
      ).to.emit(matchManager, "MatchResultSubmitted");

      const state = await matchManager.getMatchState(matchId);
      expect(state.resultSubmitted).to.be.true;
      expect(state.agent1Pnl).to.equal(ethers.parseUnits("250", 6));
    });

    it("should not allow non-oracle to submit result", async function () {
      const { matchManager, escrow, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = await startMatch(matchManager, escrow, agent1Wallet, agent2Wallet);
      await time.increase(MATCH_DURATION + 1);

      await expect(
        matchManager.connect(agent1Wallet).submitResult(matchId, 100, -100, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(matchManager, "NotTrustedOracle");
    });

    it("should not allow early result submission", async function () {
      const { matchManager, escrow, oracle, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = await startMatch(matchManager, escrow, agent1Wallet, agent2Wallet);

      // Only 5 minutes passed
      await time.increase(300);

      await expect(
        matchManager.connect(oracle).submitResult(matchId, 100, -100, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(matchManager, "MatchNotEnded");
    });
  });

  describe("Settlement", function () {
    async function completeMatch(matchManager, escrow, oracle, agent1Wallet, agent2Wallet) {
      const tx = await matchManager.connect(agent1Wallet).createChallenge(1, 2, 0);
      const receipt = await tx.wait();
      const matchId = receipt.logs.find(l => l.fragment?.name === "ChallengeCreated").args[0];

      await escrow.connect(agent1Wallet).fundMatch(matchId, 1);
      await escrow.connect(agent2Wallet).fundMatch(matchId, 2);
      await matchManager.acceptChallenge(matchId);

      await time.increase(MATCH_DURATION + 1);

      const resultHash = ethers.keccak256(ethers.toUtf8Bytes("result"));
      await matchManager.connect(oracle).submitResult(matchId, 250, -150, resultHash);

      return matchId;
    }

    it("should settle match and update ELO", async function () {
      const { matchManager, escrow, arenaRegistry, oracle, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = await completeMatch(matchManager, escrow, oracle, agent1Wallet, agent2Wallet);

      const stats1Before = await arenaRegistry.getStats(1);
      const stats2Before = await arenaRegistry.getStats(2);

      await expect(matchManager.settleMatch(matchId))
        .to.emit(matchManager, "MatchSettled");

      const stats1After = await arenaRegistry.getStats(1);
      const stats2After = await arenaRegistry.getStats(2);

      // Winner gains ELO
      expect(stats1After.elo).to.be.gt(stats1Before.elo);
      // Loser loses ELO
      expect(stats2After.elo).to.be.lt(stats2Before.elo);
      // Win/loss recorded
      expect(stats1After.wins).to.equal(1);
      expect(stats2After.losses).to.equal(1);
    });

    it("should not allow double settlement", async function () {
      const { matchManager, escrow, oracle, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = await completeMatch(matchManager, escrow, oracle, agent1Wallet, agent2Wallet);

      await matchManager.settleMatch(matchId);

      await expect(
        matchManager.settleMatch(matchId)
      ).to.be.revertedWithCustomError(matchManager, "AlreadySettled");
    });

    it("should clear active match after settlement", async function () {
      const { matchManager, escrow, oracle, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      const matchId = await completeMatch(matchManager, escrow, oracle, agent1Wallet, agent2Wallet);

      expect(await matchManager.isAgentInMatch(1)).to.be.true;
      expect(await matchManager.isAgentInMatch(2)).to.be.true;

      await matchManager.settleMatch(matchId);

      expect(await matchManager.isAgentInMatch(1)).to.be.false;
      expect(await matchManager.isAgentInMatch(2)).to.be.false;
    });
  });

  describe("Admin Functions", function () {
    it("should allow owner to set oracle", async function () {
      const { matchManager, owner, agent1Wallet } = await loadFixture(deployFixture);

      await expect(matchManager.connect(owner).setOracle(agent1Wallet.address, true))
        .to.emit(matchManager, "OracleUpdated")
        .withArgs(agent1Wallet.address, true);

      expect(await matchManager.trustedOracles(agent1Wallet.address)).to.be.true;
    });

    it("should allow owner to update match duration", async function () {
      const { matchManager, owner } = await loadFixture(deployFixture);

      await matchManager.connect(owner).setMatchDuration(1800); // 30 minutes

      expect(await matchManager.matchDuration()).to.equal(1800);
    });
  });
});
