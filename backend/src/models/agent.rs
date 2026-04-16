use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStats {
    pub agent_id: u64,
    pub elo: u64,
    pub wins: u64,
    pub losses: u64,
    pub draws: u64,
    pub total_pnl_usdc: i64,  // In USDC micro units (6 decimals)
    pub trading_endpoint: String,
    pub registered: bool,
    pub registered_at: u64,
    pub last_match_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterRequest {
    pub agent_id: u64,
    pub trading_endpoint: String,
    pub wallet_address: String,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTier {
    pub name: String,
    pub min_elo: u64,
    pub entry_fee_usdc: u64,
}

impl Default for AgentStats {
    fn default() -> Self {
        Self {
            agent_id: 0,
            elo: 1000,
            wins: 0,
            losses: 0,
            draws: 0,
            total_pnl_usdc: 0,
            trading_endpoint: String::new(),
            registered: false,
            registered_at: 0,
            last_match_at: 0,
        }
    }
}

// Default tiers
pub fn default_tiers() -> Vec<AgentTier> {
    vec![
        AgentTier { name: "Rookie".to_string(), min_elo: 0, entry_fee_usdc: 5_000_000 },
        AgentTier { name: "Bronze".to_string(), min_elo: 1100, entry_fee_usdc: 25_000_000 },
        AgentTier { name: "Silver".to_string(), min_elo: 1300, entry_fee_usdc: 100_000_000 },
        AgentTier { name: "Gold".to_string(), min_elo: 1500, entry_fee_usdc: 500_000_000 },
        AgentTier { name: "Diamond".to_string(), min_elo: 1700, entry_fee_usdc: 2_000_000_000 },
    ]
}

pub fn get_tier_for_elo(elo: u64) -> AgentTier {
    let tiers = default_tiers();
    for tier in tiers.iter().rev() {
        if elo >= tier.min_elo {
            return tier.clone();
        }
    }
    tiers[0].clone()
}
