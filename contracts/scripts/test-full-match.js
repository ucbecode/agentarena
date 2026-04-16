const hre = require("hardhat");

async function main() {
  console.log("=== Full Match E2E Test on XLayer Testnet ===\n");

  const [signer] = await hre.ethers.getSigners();
  console.log("Oracle wallet:", signer.address);

  const balance = await hre.ethers.provider.getBalance(signer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "OKB\n");

  // Load deployment addresses
  const deployment = require("../deployments/xlayerTestnet.json");

  // Connect to contracts
  const ArenaRegistry = await hre.ethers.getContractFactory("ArenaRegistry");
  const arenaRegistry = ArenaRegistry.attach(deployment.contracts.ArenaRegistry);

  const MatchManager = await hre.ethers.getContractFactory("MatchManager");
  const matchManager = MatchManager.attach(deployment.contracts.MatchManager);

  const MatchEscrow = await hre.ethers.getContractFactory("MatchEscrow");
  const matchEscrow = MatchEscrow.attach(deployment.contracts.MatchEscrow);

  const MockIdentityRegistry = await hre.ethers.getContractFactory("MockIdentityRegistry");
  const identityRegistry = MockIdentityRegistry.attach(deployment.contracts.MockIdentityRegistry);

  // Test agent IDs (use timestamp suffix for uniqueness)
  const suffix = Math.floor(Date.now() / 1000) % 10000;
  const agent1Id = 1000 + suffix;
  const agent2Id = 2000 + suffix;

  console.log("=== Step 1: Register Agents in Identity Registry ===");
  try {
    let tx = await identityRegistry.registerAgent(signer.address, agent1Id);
    await tx.wait();
    console.log(`Registered Agent #${agent1Id} in identity registry`);

    tx = await identityRegistry.registerAgent(signer.address, agent2Id);
    await tx.wait();
    console.log(`Registered Agent #${agent2Id} in identity registry`);
  } catch (e) {
    console.log("Identity registration error:", e.message?.slice(0, 100));
  }

  console.log("\n=== Step 2: Register Agents in ArenaRegistry ===");
  try {
    let tx = await arenaRegistry.registerForArena(agent1Id, "https://agent1.arena.example/api");
    await tx.wait();
    console.log(`Registered Agent #${agent1Id} in arena`);
  } catch (e) {
    console.log(`Agent #${agent1Id} registration:`, e.message?.includes("Already") ? "Already registered" : e.message?.slice(0, 80));
  }

  try {
    let tx = await arenaRegistry.registerForArena(agent2Id, "https://agent2.arena.example/api");
    await tx.wait();
    console.log(`Registered Agent #${agent2Id} in arena`);
  } catch (e) {
    console.log(`Agent #${agent2Id} registration:`, e.message?.includes("Already") ? "Already registered" : e.message?.slice(0, 80));
  }

  // Check agent stats
  console.log("\n=== Agent Stats ===");
  const stats1 = await arenaRegistry.stats(agent1Id);
  const stats2 = await arenaRegistry.stats(agent2Id);
  console.log(`Agent #${agent1Id}: ELO=${stats1.elo}, Wins=${stats1.wins}, Losses=${stats1.losses}`);
  console.log(`Agent #${agent2Id}: ELO=${stats2.elo}, Wins=${stats2.wins}, Losses=${stats2.losses}`);

  // Set match duration to 5 seconds for testing
  console.log("\n=== Setting Match Duration to 5 seconds ===");
  try {
    const tx = await matchManager.setMatchDuration(5);
    await tx.wait();
    console.log("Match duration set to 5 seconds");
  } catch (e) {
    console.log("Set duration error:", e.message?.slice(0, 100));
  }

  console.log("\n=== Step 3: Create Challenge (Tier 0 - Free, $0 entry) ===");
  let matchId;
  try {
    const tier = 0; // Free tier ($0 entry for testing)
    const tx = await matchManager.createChallenge(agent1Id, agent2Id, tier);
    const receipt = await tx.wait();

    // Extract matchId from event
    const event = receipt.logs.find(log => {
      try {
        return matchManager.interface.parseLog(log)?.name === "ChallengeCreated";
      } catch { return false; }
    });

    if (event) {
      const parsed = matchManager.interface.parseLog(event);
      matchId = parsed.args.matchId;
      console.log("Challenge created!");
      console.log("Match ID:", matchId);
      console.log("TX:", receipt.hash);
    }
  } catch (e) {
    console.log("Challenge creation error:", e.message?.slice(0, 150));
    return;
  }

  if (!matchId) {
    console.log("No match ID found, exiting");
    return;
  }

  console.log("\n=== Step 3.5: Fund Match (both agents) ===");
  try {
    // Both agents need to call fundMatch even for $0 tier
    let tx = await matchEscrow.fundMatch(matchId, agent1Id);
    await tx.wait();
    console.log(`Agent #${agent1Id} funded`);

    tx = await matchEscrow.fundMatch(matchId, agent2Id);
    await tx.wait();
    console.log(`Agent #${agent2Id} funded`);
  } catch (e) {
    console.log("Funding error:", e.message?.slice(0, 100));
  }

  console.log("\n=== Step 4: Accept Challenge ===");
  try {
    const tx = await matchManager.acceptChallenge(matchId);
    const receipt = await tx.wait();
    console.log("Challenge accepted!");
    console.log("TX:", receipt.hash);
  } catch (e) {
    console.log("Accept error:", e.message?.slice(0, 100));
  }

  // Check match state
  console.log("\n=== Match State ===");
  const state = await matchManager.matchStates(matchId);
  console.log("- Challenger:", state.challenger.toString());
  console.log("- Challenged:", state.challenged.toString());
  console.log("- Accepted:", state.accepted);
  console.log("- Result Submitted:", state.resultSubmitted);

  // Wait for match to end (5 seconds + buffer)
  console.log("\n=== Waiting for match to end (6 seconds) ===");
  await new Promise(resolve => setTimeout(resolve, 6000));
  console.log("Match duration elapsed");

  console.log("\n=== Step 5: Submit Match Result (as oracle) ===");
  // Simulated P&L results (in micro-USDC, 6 decimals)
  const agent1Pnl = 150000;  // +$0.15
  const agent2Pnl = -120000; // -$0.12

  // Create result hash
  const resultHash = hre.ethers.keccak256(
    hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "int256", "int256", "uint256"],
      [matchId, agent1Pnl, agent2Pnl, Math.floor(Date.now() / 1000)]
    )
  );

  try {
    const tx = await matchManager.submitResult(matchId, agent1Pnl, agent2Pnl, resultHash);
    const receipt = await tx.wait();
    console.log("Result submitted on-chain!");
    console.log("TX:", receipt.hash);
    console.log(`Agent #${agent1Id} P&L: $${(agent1Pnl / 1e6).toFixed(2)}`);
    console.log(`Agent #${agent2Id} P&L: $${(agent2Pnl / 1e6).toFixed(2)}`);
    console.log(`Winner: Agent #${agent1Id}`);
  } catch (e) {
    console.log("Submit result error:", e.message?.slice(0, 150));
  }

  console.log("\n=== Step 6: Settle Match ===");
  try {
    const tx = await matchManager.settleMatch(matchId);
    const receipt = await tx.wait();
    console.log("Match settled!");
    console.log("TX:", receipt.hash);
  } catch (e) {
    console.log("Settle error:", e.message?.slice(0, 100));
  }

  // Final stats
  console.log("\n=== Final Agent Stats ===");
  const finalStats1 = await arenaRegistry.stats(agent1Id);
  const finalStats2 = await arenaRegistry.stats(agent2Id);
  console.log(`Agent #${agent1Id}: ELO=${finalStats1.elo}, Wins=${finalStats1.wins}, Losses=${finalStats1.losses}`);
  console.log(`Agent #${agent2Id}: ELO=${finalStats2.elo}, Wins=${finalStats2.wins}, Losses=${finalStats2.losses}`);

  console.log("\n=== Test Complete ===");
  console.log("View on explorer: https://www.okx.com/explorer/xlayer-test/address/" + deployment.contracts.MatchManager);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
