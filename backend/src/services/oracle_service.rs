use crate::error::{AppError, Result};
use ethers::{
    prelude::*,
    types::{Address, H256, U256},
};
use std::sync::Arc;

abigen!(
    MatchManagerContract,
    r#"[
        function createChallenge(uint256 challengerId, uint256 challengedId, uint256 tier) external returns (bytes32 matchId)
        function acceptChallenge(bytes32 matchId) external
        function submitResult(bytes32 matchId, int256 agent1Pnl, int256 agent2Pnl, bytes32 resultHash) external
        function settleMatch(bytes32 matchId) external
        function setMatchDuration(uint256 duration) external
        event ChallengeCreated(bytes32 indexed matchId, uint256 challenger, uint256 challenged, uint256 tier)
    ]"#
);

abigen!(
    MatchEscrowContract,
    r#"[
        function fundMatch(bytes32 matchId, uint256 agentId) external
        function isFullyFunded(bytes32 matchId) external view returns (bool)
    ]"#
);

abigen!(
    ArenaRegistryContract,
    r#"[
        function registerForArena(uint256 agentId, string tradingEndpoint) external
        function stats(uint256 agentId) external view returns (uint256 elo, uint256 wins, uint256 losses, uint256 draws, int256 totalPnlUsdc, string tradingEndpoint, bool registered, uint256 registeredAt, uint256 lastMatchAt)
    ]"#
);

abigen!(
    MockIdentityRegistryContract,
    r#"[
        function registerAgent(address wallet, uint256 agentId) external
        function agentExists(uint256 agentId) external view returns (bool)
    ]"#
);

/// Oracle service for submitting match results on-chain
pub struct OracleService {
    rpc_url: String,
    match_manager_address: Option<String>,
    match_escrow_address: Option<String>,
    arena_registry_address: Option<String>,
    identity_registry_address: Option<String>,
    private_key: Option<String>,
}

impl OracleService {
    pub fn new(
        rpc_url: String,
        match_manager_address: Option<String>,
        private_key: Option<String>,
    ) -> Self {
        // Load other contract addresses from env
        let match_escrow_address = std::env::var("MATCH_ESCROW").ok();
        let arena_registry_address = std::env::var("ARENA_REGISTRY").ok();
        let identity_registry_address = std::env::var("IDENTITY_REGISTRY").ok();

        Self {
            rpc_url,
            match_manager_address,
            match_escrow_address,
            arena_registry_address,
            identity_registry_address,
            private_key,
        }
    }

    fn get_client(&self) -> Result<Arc<SignerMiddleware<Provider<Http>, LocalWallet>>> {
        let private_key = self
            .private_key
            .as_ref()
            .ok_or_else(|| AppError::Internal("Oracle private key not configured".to_string()))?;

        let provider = Provider::<Http>::try_from(&self.rpc_url)
            .map_err(|e| AppError::Internal(format!("Provider error: {}", e)))?;

        let wallet: LocalWallet = private_key
            .parse()
            .map_err(|e| AppError::Internal(format!("Invalid private key: {}", e)))?;

        let chain_id = std::env::var("XLAYER_CHAIN_ID")
            .unwrap_or_else(|_| "1952".to_string())
            .parse::<u64>()
            .unwrap_or(1952);
        let wallet = wallet.with_chain_id(chain_id);

        let client = SignerMiddleware::new(provider, wallet);
        Ok(Arc::new(client))
    }

    /// Register an agent in the identity registry (for testing)
    pub async fn register_agent_identity(&self, agent_id: u64) -> Result<()> {
        let identity_address = self
            .identity_registry_address
            .as_ref()
            .ok_or_else(|| AppError::Internal("Identity registry not configured".to_string()))?;

        let client = self.get_client()?;
        let wallet_address = client.address();

        let identity_addr: Address = identity_address
            .parse()
            .map_err(|e| AppError::Internal(format!("Invalid identity address: {}", e)))?;

        let contract = MockIdentityRegistryContract::new(identity_addr, client);

        // Check if already registered
        let exists = contract
            .agent_exists(U256::from(agent_id))
            .call()
            .await
            .unwrap_or(false);

        if exists {
            tracing::info!("Agent {} already registered in identity registry", agent_id);
            return Ok(());
        }

        let call = contract.register_agent(wallet_address, U256::from(agent_id));
        let pending_tx = call
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Register identity error: {}", e)))?;

        pending_tx
            .await
            .map_err(|e| AppError::Internal(format!("Tx confirmation error: {}", e)))?;

        tracing::info!("Registered agent {} in identity registry", agent_id);
        Ok(())
    }

    /// Register an agent in the arena registry
    pub async fn register_agent_arena(&self, agent_id: u64, endpoint: &str) -> Result<()> {
        let arena_address = self
            .arena_registry_address
            .as_ref()
            .ok_or_else(|| AppError::Internal("Arena registry not configured".to_string()))?;

        let client = self.get_client()?;

        let arena_addr: Address = arena_address
            .parse()
            .map_err(|e| AppError::Internal(format!("Invalid arena address: {}", e)))?;

        let contract = ArenaRegistryContract::new(arena_addr, client);

        // Check if already registered
        let stats = contract
            .stats(U256::from(agent_id))
            .call()
            .await
            .map_err(|e| AppError::Internal(format!("Stats query error: {}", e)))?;

        if stats.6 {
            // registered field
            tracing::info!("Agent {} already registered in arena", agent_id);
            return Ok(());
        }

        let call = contract.register_for_arena(U256::from(agent_id), endpoint.to_string());
        let pending_tx = call
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Register arena error: {}", e)))?;

        pending_tx
            .await
            .map_err(|e| AppError::Internal(format!("Tx confirmation error: {}", e)))?;

        tracing::info!("Registered agent {} in arena", agent_id);
        Ok(())
    }

    /// Create a challenge on-chain
    pub async fn create_challenge(
        &self,
        challenger_id: u64,
        challenged_id: u64,
        tier: u64,
    ) -> Result<String> {
        let contract_address = self
            .match_manager_address
            .as_ref()
            .ok_or_else(|| AppError::Internal("Match manager not configured".to_string()))?;

        let client = self.get_client()?;

        let contract_addr: Address = contract_address
            .parse()
            .map_err(|e| AppError::Internal(format!("Invalid contract address: {}", e)))?;

        let contract = MatchManagerContract::new(contract_addr, client);

        let call = contract.create_challenge(
            U256::from(challenger_id),
            U256::from(challenged_id),
            U256::from(tier),
        );

        let pending_tx = call
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Create challenge error: {}", e)))?;

        let receipt = pending_tx
            .await
            .map_err(|e| AppError::Internal(format!("Tx confirmation error: {}", e)))?
            .ok_or_else(|| AppError::Internal("No receipt".to_string()))?;

        // Extract match ID from event
        for log in receipt.logs {
            if log.topics.len() >= 2 {
                // ChallengeCreated event has matchId as first indexed topic
                let match_id = format!("{:?}", log.topics[1]);
                tracing::info!("Created challenge with match ID: {}", match_id);
                return Ok(match_id);
            }
        }

        Err(AppError::Internal("Could not extract match ID from event".to_string()))
    }

    /// Fund a match on-chain
    pub async fn fund_match(&self, match_id: &str, agent_id: u64) -> Result<()> {
        let escrow_address = self
            .match_escrow_address
            .as_ref()
            .ok_or_else(|| AppError::Internal("Match escrow not configured".to_string()))?;

        let client = self.get_client()?;

        let escrow_addr: Address = escrow_address
            .parse()
            .map_err(|e| AppError::Internal(format!("Invalid escrow address: {}", e)))?;

        let contract = MatchEscrowContract::new(escrow_addr, client);

        let match_id_bytes = self.parse_match_id(match_id)?;

        let call = contract.fund_match(match_id_bytes, U256::from(agent_id));
        let pending_tx = call
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Fund match error: {}", e)))?;

        pending_tx
            .await
            .map_err(|e| AppError::Internal(format!("Tx confirmation error: {}", e)))?;

        tracing::info!("Funded match {} for agent {}", match_id, agent_id);
        Ok(())
    }

    /// Accept a challenge on-chain
    pub async fn accept_challenge(&self, match_id: &str) -> Result<String> {
        let contract_address = self
            .match_manager_address
            .as_ref()
            .ok_or_else(|| AppError::Internal("Match manager not configured".to_string()))?;

        let client = self.get_client()?;

        let contract_addr: Address = contract_address
            .parse()
            .map_err(|e| AppError::Internal(format!("Invalid contract address: {}", e)))?;

        let contract = MatchManagerContract::new(contract_addr, client);

        let match_id_bytes = self.parse_match_id(match_id)?;

        let call = contract.accept_challenge(match_id_bytes);
        let pending_tx = call
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Accept challenge error: {}", e)))?;

        let receipt = pending_tx
            .await
            .map_err(|e| AppError::Internal(format!("Tx confirmation error: {}", e)))?
            .ok_or_else(|| AppError::Internal("No receipt".to_string()))?;

        let tx_hash = format!("{:?}", receipt.transaction_hash);
        tracing::info!("Accepted challenge {}: {}", match_id, tx_hash);
        Ok(tx_hash)
    }

    /// Submit match result on-chain
    pub async fn submit_result(
        &self,
        match_id: &str,
        agent1_pnl: i64,
        agent2_pnl: i64,
    ) -> Result<String> {
        let contract_address = self
            .match_manager_address
            .as_ref()
            .ok_or_else(|| AppError::Internal("Contract address not configured".to_string()))?;

        let client = self.get_client()?;

        let contract_addr: Address = contract_address
            .parse()
            .map_err(|e| AppError::Internal(format!("Invalid contract address: {}", e)))?;

        let contract = MatchManagerContract::new(contract_addr, client);

        let match_id_bytes = self.parse_match_id(match_id)?;

        // Create result hash (hash of results for verification)
        let result_hash = ethers::utils::keccak256(ethers::abi::encode(&[
            ethers::abi::Token::Int(I256::from(agent1_pnl).into_raw()),
            ethers::abi::Token::Int(I256::from(agent2_pnl).into_raw()),
        ]));

        let call = contract.submit_result(
            match_id_bytes,
            I256::from(agent1_pnl),
            I256::from(agent2_pnl),
            result_hash,
        );

        let pending_tx = call
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Transaction error: {}", e)))?;

        let receipt = pending_tx
            .await
            .map_err(|e| AppError::Internal(format!("Tx confirmation error: {}", e)))?
            .ok_or_else(|| AppError::Internal("No receipt".to_string()))?;

        let tx_hash = format!("{:?}", receipt.transaction_hash);
        tracing::info!("Submitted result for match {}: {}", match_id, tx_hash);
        Ok(tx_hash)
    }

    /// Settle match on-chain (distribute prizes)
    pub async fn settle_match(&self, match_id: &str) -> Result<String> {
        let contract_address = self
            .match_manager_address
            .as_ref()
            .ok_or_else(|| AppError::Internal("Contract address not configured".to_string()))?;

        let client = self.get_client()?;

        let contract_addr: Address = contract_address
            .parse()
            .map_err(|e| AppError::Internal(format!("Invalid contract address: {}", e)))?;

        let contract = MatchManagerContract::new(contract_addr, client);

        let match_id_bytes = self.parse_match_id(match_id)?;

        let call = contract.settle_match(match_id_bytes);

        let pending_tx = call
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Transaction error: {}", e)))?;

        let receipt = pending_tx
            .await
            .map_err(|e| AppError::Internal(format!("Tx confirmation error: {}", e)))?
            .ok_or_else(|| AppError::Internal("No receipt".to_string()))?;

        let tx_hash = format!("{:?}", receipt.transaction_hash);
        tracing::info!("Settled match {}: {}", match_id, tx_hash);
        Ok(tx_hash)
    }

    /// Set match duration (for testing)
    pub async fn set_match_duration(&self, duration_secs: u64) -> Result<()> {
        let contract_address = self
            .match_manager_address
            .as_ref()
            .ok_or_else(|| AppError::Internal("Match manager not configured".to_string()))?;

        let client = self.get_client()?;

        let contract_addr: Address = contract_address
            .parse()
            .map_err(|e| AppError::Internal(format!("Invalid contract address: {}", e)))?;

        let contract = MatchManagerContract::new(contract_addr, client);

        let call = contract.set_match_duration(U256::from(duration_secs));
        let pending_tx = call
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Set duration error: {}", e)))?;

        pending_tx
            .await
            .map_err(|e| AppError::Internal(format!("Tx confirmation error: {}", e)))?;

        tracing::info!("Set match duration to {} seconds", duration_secs);
        Ok(())
    }

    /// Full on-chain match flow (for demo)
    pub async fn create_full_onchain_match(
        &self,
        agent1_id: u64,
        agent2_id: u64,
        tier: u64,
    ) -> Result<String> {
        tracing::info!(
            "Creating full on-chain match: Agent {} vs Agent {}, tier {}",
            agent1_id,
            agent2_id,
            tier
        );

        // 1. Register agents in identity registry
        self.register_agent_identity(agent1_id).await?;
        self.register_agent_identity(agent2_id).await?;

        // 2. Register agents in arena
        self.register_agent_arena(agent1_id, &format!("http://agent{}.arena.local", agent1_id))
            .await?;
        self.register_agent_arena(agent2_id, &format!("http://agent{}.arena.local", agent2_id))
            .await?;

        // 3. Create challenge
        let match_id = self.create_challenge(agent1_id, agent2_id, tier).await?;

        // 4. Fund match (both agents - free tier so no USDC needed)
        self.fund_match(&match_id, agent1_id).await?;
        self.fund_match(&match_id, agent2_id).await?;

        // 5. Accept challenge
        self.accept_challenge(&match_id).await?;

        tracing::info!("On-chain match {} ready for trading", match_id);
        Ok(match_id)
    }

    /// Complete on-chain match settlement
    pub async fn complete_onchain_match(
        &self,
        match_id: &str,
        agent1_pnl: i64,
        agent2_pnl: i64,
    ) -> Result<String> {
        // Submit result
        self.submit_result(match_id, agent1_pnl, agent2_pnl).await?;

        // Settle match
        let tx_hash = self.settle_match(match_id).await?;

        tracing::info!(
            "On-chain match {} completed. Agent1 P&L: {}, Agent2 P&L: {}",
            match_id,
            agent1_pnl,
            agent2_pnl
        );

        Ok(tx_hash)
    }

    fn parse_match_id(&self, match_id: &str) -> Result<[u8; 32]> {
        if match_id.starts_with("0x") {
            hex::decode(&match_id[2..])
                .map_err(|e| AppError::Internal(format!("Invalid match ID: {}", e)))?
                .try_into()
                .map_err(|_| AppError::Internal("Match ID must be 32 bytes".to_string()))
        } else {
            Ok(ethers::utils::keccak256(match_id.as_bytes()))
        }
    }

    /// Check if oracle is configured
    pub fn is_configured(&self) -> bool {
        self.match_manager_address.is_some() && self.private_key.is_some()
    }
}
