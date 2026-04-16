const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=== Deploying MockIdentityRegistry for Testing ===\n");

  const [signer] = await hre.ethers.getSigners();
  console.log("Deployer:", signer.address);

  const balance = await hre.ethers.provider.getBalance(signer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "OKB\n");

  // Deploy MockIdentityRegistry
  console.log("Deploying MockIdentityRegistry...");
  const MockIdentityRegistry = await hre.ethers.getContractFactory("MockIdentityRegistry");
  const mockIdentity = await MockIdentityRegistry.deploy();
  await mockIdentity.waitForDeployment();
  const mockIdentityAddr = await mockIdentity.getAddress();
  console.log("MockIdentityRegistry deployed to:", mockIdentityAddr);

  // Register test agents
  console.log("\nRegistering test agents...");
  let tx = await mockIdentity.registerAgent(signer.address, 201);
  await tx.wait();
  console.log("Registered Agent #201 with wallet", signer.address);

  tx = await mockIdentity.registerAgent(signer.address, 202);
  await tx.wait();
  console.log("Registered Agent #202 with wallet", signer.address);

  // Load existing deployment
  const deploymentPath = path.join(__dirname, "../deployments/xlayerTestnet.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  // Update ArenaRegistry to use MockIdentityRegistry
  console.log("\nUpdating ArenaRegistry to use MockIdentityRegistry...");
  const ArenaRegistry = await hre.ethers.getContractFactory("ArenaRegistry");
  const arenaRegistry = ArenaRegistry.attach(deployment.contracts.ArenaRegistry);

  // Check if we can update (owner only)
  try {
    tx = await arenaRegistry.setIdentityRegistry(mockIdentityAddr);
    await tx.wait();
    console.log("ArenaRegistry updated to use MockIdentityRegistry");
  } catch (e) {
    console.log("Cannot update ArenaRegistry (may need owner access or function doesn't exist)");
    console.log("Error:", e.message?.slice(0, 100));
  }

  // Update deployment file
  deployment.contracts.MockIdentityRegistry = mockIdentityAddr;
  deployment.configuration.MockIdentityRegistry = mockIdentityAddr;
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log("\nUpdated deployment file with MockIdentityRegistry address");

  console.log("\n=== Deployment Complete ===");
  console.log("MockIdentityRegistry:", mockIdentityAddr);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
