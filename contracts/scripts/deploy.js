const hre = require("hardhat");

async function main() {
  console.log("Deploying AgentArena contracts to", hre.network.name);

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Configuration
  const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x74b7F16337b8972027F6196A17a631aC6dE26d22";
  const PLATFORM_WALLET = process.env.PLATFORM_WALLET || deployer.address;

  console.log("\nConfiguration:");
  console.log("- USDC:", USDC_ADDRESS);
  console.log("- Platform Wallet:", PLATFORM_WALLET);

  // 0. Deploy MockIdentityRegistry for testing
  console.log("\n0. Deploying MockIdentityRegistry...");
  const MockIdentityRegistry = await hre.ethers.getContractFactory("MockIdentityRegistry");
  const mockIdentity = await MockIdentityRegistry.deploy();
  await mockIdentity.waitForDeployment();
  const identityAddress = await mockIdentity.getAddress();
  console.log("   MockIdentityRegistry deployed to:", identityAddress);

  // Register test agents
  console.log("   Registering test agents 201 and 202...");
  await mockIdentity.registerAgent(deployer.address, 201);
  await mockIdentity.registerAgent(deployer.address, 202);
  console.log("   Test agents registered with wallet:", deployer.address);

  // 1. Deploy ArenaRegistry
  console.log("\n1. Deploying ArenaRegistry...");
  const ArenaRegistry = await hre.ethers.getContractFactory("ArenaRegistry");
  const arenaRegistry = await ArenaRegistry.deploy(identityAddress);
  await arenaRegistry.waitForDeployment();
  const arenaRegistryAddress = await arenaRegistry.getAddress();
  console.log("   ArenaRegistry deployed to:", arenaRegistryAddress);

  // 2. Deploy MatchEscrow
  console.log("\n2. Deploying MatchEscrow...");
  const MatchEscrow = await hre.ethers.getContractFactory("MatchEscrow");
  const matchEscrow = await MatchEscrow.deploy(USDC_ADDRESS, PLATFORM_WALLET);
  await matchEscrow.waitForDeployment();
  const matchEscrowAddress = await matchEscrow.getAddress();
  console.log("   MatchEscrow deployed to:", matchEscrowAddress);

  // 3. Deploy MatchManager
  console.log("\n3. Deploying MatchManager...");
  const MatchManager = await hre.ethers.getContractFactory("MatchManager");
  const matchManager = await MatchManager.deploy(arenaRegistryAddress, matchEscrowAddress);
  await matchManager.waitForDeployment();
  const matchManagerAddress = await matchManager.getAddress();
  console.log("   MatchManager deployed to:", matchManagerAddress);

  // 4. Deploy TournamentManager
  console.log("\n4. Deploying TournamentManager...");
  const TournamentManager = await hre.ethers.getContractFactory("TournamentManager");
  const tournamentManager = await TournamentManager.deploy(
    USDC_ADDRESS,
    arenaRegistryAddress,
    matchEscrowAddress
  );
  await tournamentManager.waitForDeployment();
  const tournamentManagerAddress = await tournamentManager.getAddress();
  console.log("   TournamentManager deployed to:", tournamentManagerAddress);

  // 5. Deploy LeaderboardContract
  console.log("\n5. Deploying LeaderboardContract...");
  const LeaderboardContract = await hre.ethers.getContractFactory("LeaderboardContract");
  const leaderboard = await LeaderboardContract.deploy(arenaRegistryAddress);
  await leaderboard.waitForDeployment();
  const leaderboardAddress = await leaderboard.getAddress();
  console.log("   LeaderboardContract deployed to:", leaderboardAddress);

  // 6. Configure permissions
  console.log("\n6. Configuring permissions...");

  // ArenaRegistry: authorize MatchManager
  console.log("   - Authorizing MatchManager in ArenaRegistry...");
  await arenaRegistry.setManager(matchManagerAddress, true);

  // MatchEscrow: authorize MatchManager
  console.log("   - Authorizing MatchManager in MatchEscrow...");
  await matchEscrow.setManager(matchManagerAddress, true);

  // MatchManager: set deployer as oracle (for testing)
  console.log("   - Setting deployer as trusted oracle...");
  await matchManager.setOracle(deployer.address, true);

  console.log("\n=== Deployment Complete ===");
  console.log("\nContract Addresses:");
  console.log("ARENA_REGISTRY=" + arenaRegistryAddress);
  console.log("MATCH_ESCROW=" + matchEscrowAddress);
  console.log("MATCH_MANAGER=" + matchManagerAddress);
  console.log("TOURNAMENT_MANAGER=" + tournamentManagerAddress);
  console.log("LEADERBOARD=" + leaderboardAddress);

  // Save deployment info
  const fs = require("fs");
  const deployment = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      MockIdentityRegistry: identityAddress,
      ArenaRegistry: arenaRegistryAddress,
      MatchEscrow: matchEscrowAddress,
      MatchManager: matchManagerAddress,
      TournamentManager: tournamentManagerAddress,
      LeaderboardContract: leaderboardAddress,
    },
    configuration: {
      USDC: USDC_ADDRESS,
      IdentityRegistry: identityAddress,
      PlatformWallet: PLATFORM_WALLET,
    },
  };

  fs.writeFileSync(
    `deployments/${hre.network.name}.json`,
    JSON.stringify(deployment, null, 2)
  );
  console.log(`\nDeployment info saved to deployments/${hre.network.name}.json`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
