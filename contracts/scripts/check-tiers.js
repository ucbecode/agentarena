const hre = require("hardhat");

async function main() {
  const deployment = require("../deployments/xlayerTestnet.json");

  const ArenaRegistry = await hre.ethers.getContractFactory("ArenaRegistry");
  const arena = ArenaRegistry.attach(deployment.contracts.ArenaRegistry);

  const MatchEscrow = await hre.ethers.getContractFactory("MatchEscrow");
  const escrow = MatchEscrow.attach(deployment.contracts.MatchEscrow);

  console.log("=== Tiers ===");
  const tierCount = await arena.getTierCount();
  console.log("Total tiers:", tierCount.toString());

  for (let i = 0; i < tierCount; i++) {
    const tier = await arena.tiers(i);
    console.log(`Tier ${i}: ${tier.name} - Min ELO: ${tier.minElo}, Entry: $${Number(tier.entryFeeUsdc) / 1e6}`);
  }

  // Check match state
  const matchId = "0xd7b15bc95607dcfdcfcc82fc079d4b746b90b04e24ab934ca9833543b9b51dee";
  console.log("\n=== Match State ===");
  try {
    const match = await escrow.getMatch(matchId);
    console.log("Entry Fee:", match.entryFee.toString(), "($" + (Number(match.entryFee) / 1e6) + ")");
    console.log("Agent 1 Funded:", match.agent1Funded);
    console.log("Agent 2 Funded:", match.agent2Funded);
    console.log("Status:", match.status);
  } catch (e) {
    console.log("Error:", e.message?.slice(0, 100));
  }
}

main()
  .then(() => process.exit(0))
  .catch(console.error);
