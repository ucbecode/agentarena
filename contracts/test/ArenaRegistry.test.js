const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("ArenaRegistry", function () {
  async function deployFixture() {
    const [owner, agent1Wallet, agent2Wallet, agent3Wallet] = await ethers.getSigners();

    // Deploy mock identity registry
    const MockIdentityRegistry = await ethers.getContractFactory("MockIdentityRegistry");
    const identityRegistry = await MockIdentityRegistry.deploy();

    // Register mock agents
    await identityRegistry.registerAgent(agent1Wallet.address, 1);
    await identityRegistry.registerAgent(agent2Wallet.address, 2);
    await identityRegistry.registerAgent(agent3Wallet.address, 3);

    // Deploy ArenaRegistry
    const ArenaRegistry = await ethers.getContractFactory("ArenaRegistry");
    const arenaRegistry = await ArenaRegistry.deploy(await identityRegistry.getAddress());

    return { arenaRegistry, identityRegistry, owner, agent1Wallet, agent2Wallet, agent3Wallet };
  }

  describe("Registration", function () {
    it("should register an agent for arena", async function () {
      const { arenaRegistry, agent1Wallet } = await loadFixture(deployFixture);

      await arenaRegistry.connect(agent1Wallet).registerForArena(
        1,
        "https://agent1.example.com/trade"
      );

      const stats = await arenaRegistry.getStats(1);
      expect(stats.registered).to.be.true;
      expect(stats.elo).to.equal(1200);
      expect(stats.wins).to.equal(0);
      expect(stats.losses).to.equal(0);
    });

    it("should not allow double registration", async function () {
      const { arenaRegistry, agent1Wallet } = await loadFixture(deployFixture);

      await arenaRegistry.connect(agent1Wallet).registerForArena(1, "https://agent1.example.com");

      await expect(
        arenaRegistry.connect(agent1Wallet).registerForArena(1, "https://agent1.example.com")
      ).to.be.revertedWithCustomError(arenaRegistry, "AlreadyRegistered");
    });

    it("should not allow registration by non-owner", async function () {
      const { arenaRegistry, agent2Wallet } = await loadFixture(deployFixture);

      await expect(
        arenaRegistry.connect(agent2Wallet).registerForArena(1, "https://fake.com")
      ).to.be.revertedWithCustomError(arenaRegistry, "NotAgentOwner");
    });
  });

  describe("ELO Updates", function () {
    it("should update ELO after a win", async function () {
      const { arenaRegistry, agent1Wallet, agent2Wallet, owner } = await loadFixture(deployFixture);

      await arenaRegistry.connect(agent1Wallet).registerForArena(1, "https://agent1.example.com");
      await arenaRegistry.connect(agent2Wallet).registerForArena(2, "https://agent2.example.com");

      // Set owner as match manager
      await arenaRegistry.setMatchManager(owner.address, true);

      // Agent 1 wins
      await arenaRegistry.updateElo(1, 2, false);

      const stats1 = await arenaRegistry.getStats(1);
      const stats2 = await arenaRegistry.getStats(2);

      // Winner gains ELO
      expect(stats1.elo).to.be.gt(1200);
      // Loser loses ELO
      expect(stats2.elo).to.be.lt(1200);
    });

    it("should handle draws correctly", async function () {
      const { arenaRegistry, agent1Wallet, agent2Wallet, owner } = await loadFixture(deployFixture);

      await arenaRegistry.connect(agent1Wallet).registerForArena(1, "https://agent1.example.com");
      await arenaRegistry.connect(agent2Wallet).registerForArena(2, "https://agent2.example.com");

      await arenaRegistry.setMatchManager(owner.address, true);

      // Draw
      await arenaRegistry.updateElo(1, 2, true);

      const stats1 = await arenaRegistry.getStats(1);
      const stats2 = await arenaRegistry.getStats(2);

      // Both should stay at 1200 for equal ELO draw
      expect(stats1.elo).to.equal(1200);
      expect(stats2.elo).to.equal(1200);
    });

    it("should only allow match manager to update ELO", async function () {
      const { arenaRegistry, agent1Wallet, agent2Wallet } = await loadFixture(deployFixture);

      await arenaRegistry.connect(agent1Wallet).registerForArena(1, "https://agent1.example.com");
      await arenaRegistry.connect(agent2Wallet).registerForArena(2, "https://agent2.example.com");

      await expect(
        arenaRegistry.connect(agent1Wallet).updateElo(1, 2, false)
      ).to.be.revertedWithCustomError(arenaRegistry, "Unauthorized");
    });
  });

  describe("Tier System", function () {
    it("should return correct tier for ELO", async function () {
      const { arenaRegistry, agent1Wallet, owner } = await loadFixture(deployFixture);

      await arenaRegistry.connect(agent1Wallet).registerForArena(1, "https://agent1.example.com");

      // Initial ELO 1200 should be Rookie (tier 0)
      const [tierIndex, tier] = await arenaRegistry.getAgentTier(1);
      expect(tierIndex).to.equal(0);
      expect(tier.name).to.equal("Rookie");
    });

    it("should check tier eligibility correctly", async function () {
      const { arenaRegistry, agent1Wallet } = await loadFixture(deployFixture);

      await arenaRegistry.connect(agent1Wallet).registerForArena(1, "https://agent1.example.com");

      // Should be able to compete in Rookie tier
      expect(await arenaRegistry.canCompeteInTier(1, 0)).to.be.true;

      // Should not be able to compete in Bronze tier (requires 1100 ELO)
      expect(await arenaRegistry.canCompeteInTier(1, 1)).to.be.false;
    });
  });

  describe("Match Results", function () {
    it("should record match results correctly", async function () {
      const { arenaRegistry, agent1Wallet, owner } = await loadFixture(deployFixture);

      await arenaRegistry.connect(agent1Wallet).registerForArena(1, "https://agent1.example.com");
      await arenaRegistry.setMatchManager(owner.address, true);

      // Record a win with +500 P&L
      await arenaRegistry.recordMatchResult(1, 500000000, true); // 500 USDC (6 decimals)

      const stats = await arenaRegistry.getStats(1);
      expect(stats.wins).to.equal(1);
      expect(stats.losses).to.equal(0);
      expect(stats.totalPnl).to.equal(500000000);
    });
  });
});
