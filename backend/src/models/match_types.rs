use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MatchStatus {
    Created,
    Funded,
    InProgress,
    Completed,
    Settled,
    Cancelled,
    Disputed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Match {
    pub match_id: String,
    pub agent1_id: u64,
    pub agent2_id: u64,
    pub tier: u64,
    pub entry_fee: u64,
    pub prize_pool: u64,
    pub agent1_funded: bool,
    pub agent2_funded: bool,
    pub status: MatchStatus,
    pub created_at: u64,
    pub started_at: Option<u64>,
    pub ended_at: Option<u64>,
    pub agent1_pnl: Option<i64>,
    pub agent2_pnl: Option<i64>,
    pub winner_id: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChallengeRequest {
    pub challenger_id: u64,
    pub challenged_id: u64,
    pub tier: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChallengeResponse {
    pub match_id: String,
    pub entry_fee: u64,
    pub payment_required: Option<PaymentDetails>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentDetails {
    pub network: String,
    pub token: String,
    pub amount: u64,
    pub recipient: String,
    pub nonce: String,
    pub expires: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcceptChallengeRequest {
    pub agent_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchState {
    pub match_id: String,
    pub status: MatchStatus,
    pub time_remaining_secs: u64,
    pub agent1_state: AgentMatchState,
    pub agent2_state: AgentMatchState,
    pub prices: std::collections::HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMatchState {
    pub agent_id: u64,
    pub balance: f64,          // Simulated USDC balance
    pub positions: Vec<Position>,
    pub pnl: f64,              // Current P&L
    pub trades_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub symbol: String,        // BTC, ETH, SOL
    pub side: PositionSide,
    pub size: f64,             // In USD value
    pub entry_price: f64,
    pub current_price: f64,
    pub unrealized_pnl: f64,
    pub leverage: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PositionSide {
    Long,
    Short,
}

impl Match {
    pub fn new(agent1_id: u64, agent2_id: u64, tier: u64, entry_fee: u64) -> Self {
        Self {
            match_id: Uuid::new_v4().to_string(),
            agent1_id,
            agent2_id,
            tier,
            entry_fee,
            prize_pool: 0,
            agent1_funded: false,
            agent2_funded: false,
            status: MatchStatus::Created,
            created_at: chrono::Utc::now().timestamp() as u64,
            started_at: None,
            ended_at: None,
            agent1_pnl: None,
            agent2_pnl: None,
            winner_id: None,
        }
    }

    pub fn is_fully_funded(&self) -> bool {
        self.agent1_funded && self.agent2_funded
    }
}

impl Default for AgentMatchState {
    fn default() -> Self {
        Self {
            agent_id: 0,
            balance: 10000.0,  // Start with $10k simulated
            positions: vec![],
            pnl: 0.0,
            trades_count: 0,
        }
    }
}
