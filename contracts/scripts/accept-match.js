const hre = require("hardhat");

async function main() {
  const deployment = require("../deployments/xlayerTestnet.json");

  const MatchManager = await hre.ethers.getContractFactory("MatchManager");
  const matchManager = MatchManager.attach(deployment.contracts.MatchManager);

  const matchId = "0xfc308f8c52176cebbc97ed209b22245e8d44fe8a883c14be6d97b7ec89aa7e5b";

  console.log("=== Accepting Challenge ===");
  try {
    const tx = await matchManager.acceptChallenge(matchId);
    const receipt = await tx.wait();
    console.log("Challenge accepted!");
    console.log("TX:", receipt.hash);
  } catch (e) {
    console.log("Error:", e.message);

    // Try to decode the error
    if (e.data) {
      console.log("Error data:", e.data);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(console.error);
