const hre = require("hardhat");

async function main() {
  const deployment = require("../deployments/xlayerTestnet.json");
  const [signer] = await hre.ethers.getSigners();

  const MatchManager = await hre.ethers.getContractFactory("MatchManager");
  const matchManager = MatchManager.attach(deployment.contracts.MatchManager);

  const MatchEscrow = await hre.ethers.getContractFactory("MatchEscrow");
  const escrow = MatchEscrow.attach(deployment.contracts.MatchEscrow);

  const ArenaRegistry = await hre.ethers.getContractFactory("ArenaRegistry");
  const arena = ArenaRegistry.attach(deployment.contracts.ArenaRegistry);

  const matchId = "0xfc308f8c52176cebbc97ed209b22245e8d44fe8a883c14be6d97b7ec89aa7e5b";
  const agent1Id = 5591;
  const agent2Id = 6591;

  // Check match state
  console.log("=== Match State ===");
  const match = await escrow.getMatch(matchId);
  console.log("Started At:", match.startedAt.toString());
  const duration = await matchManager.matchDuration();
  console.log("Match Duration:", duration.toString(), "seconds");

  const now = Math.floor(Date.now() / 1000);
  const endsAt = Number(match.startedAt) + Number(duration);
  console.log("Now:", now);
  console.log("Ends At:", endsAt);
  console.log("Has Ended:", now > endsAt);

  if (now <= endsAt) {
    const waitTime = endsAt - now + 2;
    console.log(`\nWaiting ${waitTime} seconds for match to end...`);
    await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
    console.log("Wait complete");
  }

  // Submit result
  console.log("\n=== Submitting Result ===");
  const agent1Pnl = 150000;  // +$0.15 (winner)
  const agent2Pnl = -120000; // -$0.12

  const resultHash = hre.ethers.keccak256(
    hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "int256", "int256", "uint256"],
      [matchId, agent1Pnl, agent2Pnl, Math.floor(Date.now() / 1000)]
    )
  );

  try {
    const tx = await matchManager.submitResult(matchId, agent1Pnl, agent2Pnl, resultHash);
    const receipt = await tx.wait();
    console.log("Result submitted!");
    console.log("TX:", receipt.hash);
    console.log(`Agent #${agent1Id} P&L: $${(agent1Pnl / 1e6).toFixed(2)}`);
    console.log(`Agent #${agent2Id} P&L: $${(agent2Pnl / 1e6).toFixed(2)}`);
  } catch (e) {
    console.log("Error:", e.message?.slice(0, 200));
    return;
  }

  // Settle match
  console.log("\n=== Settling Match ===");
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
  const stats1 = await arena.stats(agent1Id);
  const stats2 = await arena.stats(agent2Id);
  console.log(`Agent #${agent1Id}: ELO=${stats1.elo}, Wins=${stats1.wins}, Losses=${stats1.losses}`);
  console.log(`Agent #${agent2Id}: ELO=${stats2.elo}, Wins=${stats2.wins}, Losses=${stats2.losses}`);

  console.log("\n=== SUCCESS! Full on-chain match completed! ===");
  console.log("View match on explorer:");
  console.log(`https://www.okx.com/explorer/xlayer-test/tx/${matchId}`);
}

main()
  .then(() => process.exit(0))
  .catch(console.error);
