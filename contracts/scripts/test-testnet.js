const hre = require("hardhat");

async function main() {
  console.log("Testing AgentArena contracts on XLayer Testnet\n");

  const [signer] = await hre.ethers.getSigners();
  console.log("Using account:", signer.address);

  const balance = await hre.ethers.provider.getBalance(signer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "OKB\n");

  // Load deployment addresses
  const deployment = require("../deployments/xlayerTestnet.json");
  console.log("Contract addresses:");
  console.log("- ArenaRegistry:", deployment.contracts.ArenaRegistry);
  console.log("- MatchEscrow:", deployment.contracts.MatchEscrow);
  console.log("- MatchManager:", deployment.contracts.MatchManager);
  console.log("- TournamentManager:", deployment.contracts.TournamentManager);
  console.log("- LeaderboardContract:", deployment.contracts.LeaderboardContract);
  console.log("");

  // Connect to contracts
  const ArenaRegistry = await hre.ethers.getContractFactory("ArenaRegistry");
  const arenaRegistry = ArenaRegistry.attach(deployment.contracts.ArenaRegistry);

  const MatchManager = await hre.ethers.getContractFactory("MatchManager");
  const matchManager = MatchManager.attach(deployment.contracts.MatchManager);

  const LeaderboardContract = await hre.ethers.getContractFactory("LeaderboardContract");
  const leaderboard = LeaderboardContract.attach(deployment.contracts.LeaderboardContract);

  // Test 1: Check if we're an authorized oracle
  console.log("=== Test 1: Check Oracle Status ===");
  try {
    const isOracle = await matchManager.trustedOracles(signer.address);
    console.log("Is trusted oracle:", isOracle);
  } catch (e) {
    console.log("Error checking oracle status:", e.message);
  }

  // Test 2: Check agent stats (using public mapping)
  console.log("\n=== Test 2: Check Agent Stats ===");
  const testAgentId = 1;
  try {
    const stats = await arenaRegistry.stats(testAgentId);
    console.log("Agent", testAgentId, "stats:");
    console.log("  - Registered:", stats.registered);
    console.log("  - ELO:", stats.elo.toString());
    console.log("  - Wins:", stats.wins.toString());
    console.log("  - Losses:", stats.losses.toString());
  } catch (e) {
    console.log("Error:", e.message);
  }

  // Test 3: Check match state
  console.log("\n=== Test 3: Check Existing Match State ===");
  // Use a test match ID
  const testMatchId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("test-match-001"));
  try {
    const matchState = await matchManager.getMatchState(testMatchId);
    console.log("Match state:");
    console.log("  - Status:", matchState.status.toString());
    console.log("  - Agent1:", matchState.agent1Id.toString());
    console.log("  - Agent2:", matchState.agent2Id.toString());
  } catch (e) {
    console.log("No existing match (expected for new match ID)");
  }

  // Test 4: Contract info
  console.log("\n=== Test 4: Contract Configuration ===");
  try {
    const arenaRegistryAddr = await matchManager.arenaRegistry();
    const escrowAddr = await matchManager.matchEscrow();
    console.log("MatchManager links to:");
    console.log("  - ArenaRegistry:", arenaRegistryAddr);
    console.log("  - MatchEscrow:", escrowAddr);
  } catch (e) {
    console.log("Error:", e.message);
  }

  // Test 5: Check tier info
  console.log("\n=== Test 5: Check Tiers ===");
  try {
    for (let i = 0; i < 5; i++) {
      const tier = await arenaRegistry.tiers(i);
      console.log(`  Tier ${i}: ${tier.name} - Min ELO: ${tier.minElo}, Entry: $${Number(tier.entryFeeUsdc) / 1e6}`);
    }
  } catch (e) {
    console.log("Error:", e.message);
  }

  console.log("\n=== Testnet Verification Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
