const hre = require("hardhat");

async function main() {
  const deployment = require("../deployments/xlayerTestnet.json");
  const [signer] = await hre.ethers.getSigners();

  console.log("Checking MockIdentityRegistry at:", deployment.contracts.MockIdentityRegistry);

  const MockIdentityRegistry = await hre.ethers.getContractFactory("MockIdentityRegistry");
  const identity = MockIdentityRegistry.attach(deployment.contracts.MockIdentityRegistry);

  const wallet201 = await identity.getWalletByAgent(201);
  const wallet202 = await identity.getWalletByAgent(202);
  console.log("Agent 201 wallet:", wallet201);
  console.log("Agent 202 wallet:", wallet202);

  const exists201 = await identity.agentExists(201);
  const exists202 = await identity.agentExists(202);
  console.log("Agent 201 exists:", exists201);
  console.log("Agent 202 exists:", exists202);

  // If agents aren't registered, register them now
  if (!exists201) {
    console.log("\nRegistering Agent 201...");
    const tx = await identity.registerAgent(signer.address, 201);
    await tx.wait();
    console.log("Agent 201 registered with wallet:", signer.address);
  }

  if (!exists202) {
    console.log("\nRegistering Agent 202...");
    const tx = await identity.registerAgent(signer.address, 202);
    await tx.wait();
    console.log("Agent 202 registered with wallet:", signer.address);
  }

  // Verify final state
  console.log("\n=== Final State ===");
  console.log("Agent 201 exists:", await identity.agentExists(201));
  console.log("Agent 202 exists:", await identity.agentExists(202));
  console.log("Agent 201 wallet:", await identity.getWalletByAgent(201));
  console.log("Agent 202 wallet:", await identity.getWalletByAgent(202));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
