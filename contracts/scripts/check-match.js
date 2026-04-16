const hre = require("hardhat");

async function main() {
  const deployment = require("../deployments/xlayerTestnet.json");

  const MatchEscrow = await hre.ethers.getContractFactory("MatchEscrow");
  const escrow = MatchEscrow.attach(deployment.contracts.MatchEscrow);

  const MatchManager = await hre.ethers.getContractFactory("MatchManager");
  const matchManager = MatchManager.attach(deployment.contracts.MatchManager);

  const matchId = "0xfc308f8c52176cebbc97ed209b22245e8d44fe8a883c14be6d97b7ec89aa7e5b";

  console.log("=== Match Escrow State ===");
  try {
    const match = await escrow.getMatch(matchId);
    console.log("Entry Fee:", match.entryFee.toString());
    console.log("Agent1 ID:", match.agent1Id.toString());
    console.log("Agent2 ID:", match.agent2Id.toString());
    console.log("Agent1 Funded:", match.agent1Funded);
    console.log("Agent2 Funded:", match.agent2Funded);
    console.log("Status:", match.status.toString());
    console.log("Prize Pool:", match.prizePool.toString());

    const isFullyFunded = await escrow.isFullyFunded(matchId);
    console.log("\nisFullyFunded:", isFullyFunded);
  } catch (e) {
    console.log("Error:", e.message?.slice(0, 150));
  }

  console.log("\n=== Match Manager State ===");
  try {
    const state = await matchManager.matchStates(matchId);
    console.log("Challenger:", state.challenger.toString());
    console.log("Challenged:", state.challenged.toString());
    console.log("Accepted:", state.accepted);
    console.log("ChallengedAt:", state.challengedAt.toString());

    const timeout = await matchManager.challengeTimeout();
    console.log("Challenge Timeout:", timeout.toString(), "seconds");

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = Number(state.challengedAt) + Number(timeout);
    console.log("Now:", now);
    console.log("Expires At:", expiresAt);
    console.log("Expired:", now > expiresAt);
  } catch (e) {
    console.log("Error:", e.message?.slice(0, 150));
  }
}

main()
  .then(() => process.exit(0))
  .catch(console.error);
