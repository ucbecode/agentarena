const hre = require("hardhat");

async function main() {
  const deployment = require("../deployments/xlayerTestnet.json");

  const ArenaRegistry = await hre.ethers.getContractFactory("ArenaRegistry");
  const arena = ArenaRegistry.attach(deployment.contracts.ArenaRegistry);

  console.log("=== Agent Stats ===");
  const agents = [56300, 66300, 56304, 66304];

  for (const agentId of agents) {
    const stats = await arena.stats(agentId);
    console.log(`Agent #${agentId}:`);
    console.log(`  - Registered: ${stats.registered}`);
    console.log(`  - ELO: ${stats.elo}`);
    console.log(`  - Wins: ${stats.wins}`);
    console.log(`  - Losses: ${stats.losses}`);
    console.log(`  - Total P&L: $${(Number(stats.totalPnlUsdc) / 1e6).toFixed(2)}`);
    console.log();
  }
}

main()
  .then(() => process.exit(0))
  .catch(console.error);
