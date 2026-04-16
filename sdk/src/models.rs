use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// Agent types

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStats {
    pub agent_id: u64,
    pub elo: u64,
    pub wins: u64,
    pub losses: u64,
    pub draws: u64,
    pub total_pnl_usdc: i64,
    pub trading_endpoint: String,
    pub registered: bool,
    pub registered_at: u64,
    pub last_match_at: u64,
}

// Match types

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
pub struct ChallengeResponse {
    pub match_id: String,
    pub entry_fee: u64,
    pub payment_required: Option<PaymentRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchState {
    pub match_id: String,
    pub status: MatchStatus,
    pub time_remaining_secs: u64,
    pub agent1_state: AgentMatchState,
    pub agent2_state: AgentMatchState,
    pub prices: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMatchState {
    pub agent_id: u64,
    pub balance: f64,
    pub positions: Vec<Position>,
    pub pnl: f64,
    pub trades_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub symbol: String,
    pub side: PositionSide,
    pub size: f64,
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

// Trade types

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TradeAction {
    Open,
    Close,
    Increase,
    Decrease,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TradeSide {
    Long,
    Short,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeRequest {
    pub agent_id: u64,
    pub symbol: String,
    pub action: TradeAction,
    pub side: TradeSide,
    pub size_usd: f64,
    pub leverage: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeResponse {
    pub success: bool,
    pub trade_id: String,
    pub symbol: String,
    pub side: TradeSide,
    pub action: TradeAction,
    pub size_usd: f64,
    pub price: f64,
    pub realized_pnl: Option<f64>,
    pub new_balance: f64,
    pub error: Option<String>,
}

// Payment types

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentRequest {
    pub network: String,
    pub token: String,
    pub amount: u64,
    pub recipient: String,
    pub nonce: String,
    pub expires: u64,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentProof {
    pub nonce: String,
    pub tx_hash: String,
}

// Leaderboard types

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderboardEntry {
    pub rank: u32,
    pub agent_id: u64,
    pub elo: u64,
    pub wins: u64,
    pub losses: u64,
    pub win_rate: f64,
    pub total_pnl: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Leaderboard {
    pub entries: Vec<LeaderboardEntry>,
    pub total_agents: u64,
}

// WebSocket message types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WsMessage {
    #[serde(rename = "state")]
    State { data: MatchState },
    #[serde(rename = "trade")]
    Trade { data: TradeEvent },
    #[serde(rename = "started")]
    Started,
    #[serde(rename = "ended")]
    Ended { data: MatchEndEvent },
    #[serde(rename = "error")]
    Error { error: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeEvent {
    pub agent_id: u64,
    pub symbol: String,
    pub side: String,
    pub size: f64,
    pub price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchEndEvent {
    pub winner_id: Option<u64>,
    pub agent1_pnl: i64,
    pub agent2_pnl: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_match_status_variants() {
        let statuses = vec![
            MatchStatus::Created,
            MatchStatus::Funded,
            MatchStatus::InProgress,
            MatchStatus::Completed,
            MatchStatus::Settled,
            MatchStatus::Cancelled,
            MatchStatus::Disputed,
        ];

        assert_eq!(statuses.len(), 7);
    }

    #[test]
    fn test_match_status_equality() {
        assert_eq!(MatchStatus::Created, MatchStatus::Created);
        assert_ne!(MatchStatus::Created, MatchStatus::Funded);
    }

    #[test]
    fn test_position_side_variants() {
        let long = PositionSide::Long;
        let short = PositionSide::Short;

        assert_ne!(long, short);
    }

    #[test]
    fn test_trade_action_variants() {
        let actions = vec![
            TradeAction::Open,
            TradeAction::Close,
            TradeAction::Increase,
            TradeAction::Decrease,
        ];

        assert_eq!(actions.len(), 4);
    }

    #[test]
    fn test_trade_side_variants() {
        assert_eq!(TradeSide::Long, TradeSide::Long);
        assert_ne!(TradeSide::Long, TradeSide::Short);
    }

    #[test]
    fn test_agent_stats_serialization() {
        let stats = AgentStats {
            agent_id: 1,
            elo: 1200,
            wins: 10,
            losses: 5,
            draws: 2,
            total_pnl_usdc: 50000,
            trading_endpoint: "https://agent.example.com".to_string(),
            registered: true,
            registered_at: 12345,
            last_match_at: 12400,
        };

        let json = serde_json::to_string(&stats).unwrap();
        assert!(json.contains("agent_id"));
        assert!(json.contains("1200"));

        // Deserialize
        let parsed: AgentStats = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.agent_id, 1);
        assert_eq!(parsed.elo, 1200);
    }

    #[test]
    fn test_match_serialization() {
        let m = Match {
            match_id: "test-match-1".to_string(),
            agent1_id: 1,
            agent2_id: 2,
            tier: 0,
            entry_fee: 5_000_000,
            prize_pool: 10_000_000,
            agent1_funded: true,
            agent2_funded: true,
            status: MatchStatus::Funded,
            created_at: 12345,
            started_at: None,
            ended_at: None,
            agent1_pnl: None,
            agent2_pnl: None,
            winner_id: None,
        };

        let json = serde_json::to_string(&m).unwrap();
        let parsed: Match = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.match_id, "test-match-1");
        assert_eq!(parsed.status, MatchStatus::Funded);
    }

    #[test]
    fn test_trade_request_serialization() {
        let request = TradeRequest {
            agent_id: 1,
            symbol: "BTC".to_string(),
            action: TradeAction::Open,
            side: TradeSide::Long,
            size_usd: 1000.0,
            leverage: Some(2.0),
        };

        let json = serde_json::to_string(&request).unwrap();
        let parsed: TradeRequest = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.symbol, "BTC");
        assert_eq!(parsed.action, TradeAction::Open);
        assert_eq!(parsed.leverage, Some(2.0));
    }

    #[test]
    fn test_trade_response_serialization() {
        let response = TradeResponse {
            success: true,
            trade_id: "trade-123".to_string(),
            symbol: "ETH".to_string(),
            side: TradeSide::Short,
            action: TradeAction::Open,
            size_usd: 500.0,
            price: 3000.0,
            realized_pnl: None,
            new_balance: 9500.0,
            error: None,
        };

        let json = serde_json::to_string(&response).unwrap();
        let parsed: TradeResponse = serde_json::from_str(&json).unwrap();

        assert!(parsed.success);
        assert_eq!(parsed.price, 3000.0);
    }

    #[test]
    fn test_payment_request_serialization() {
        let request = PaymentRequest {
            network: "xlayer".to_string(),
            token: "USDC".to_string(),
            amount: 5_000_000,
            recipient: "0x1234".to_string(),
            nonce: "abc123".to_string(),
            expires: 12345,
            description: Some("Entry fee".to_string()),
        };

        let json = serde_json::to_string(&request).unwrap();
        let parsed: PaymentRequest = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.network, "xlayer");
        assert_eq!(parsed.amount, 5_000_000);
    }

    #[test]
    fn test_position_serialization() {
        let position = Position {
            symbol: "SOL".to_string(),
            side: PositionSide::Long,
            size: 2000.0,
            entry_price: 100.0,
            current_price: 105.0,
            unrealized_pnl: 100.0,
            leverage: 3.0,
        };

        let json = serde_json::to_string(&position).unwrap();
        let parsed: Position = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.symbol, "SOL");
        assert_eq!(parsed.leverage, 3.0);
    }

    #[test]
    fn test_leaderboard_entry_serialization() {
        let entry = LeaderboardEntry {
            rank: 1,
            agent_id: 42,
            elo: 1500,
            wins: 20,
            losses: 5,
            win_rate: 0.8,
            total_pnl: 100000,
        };

        let json = serde_json::to_string(&entry).unwrap();
        let parsed: LeaderboardEntry = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.rank, 1);
        assert_eq!(parsed.win_rate, 0.8);
    }

    #[test]
    fn test_ws_message_state_serialization() {
        let state = MatchState {
            match_id: "test".to_string(),
            status: MatchStatus::InProgress,
            time_remaining_secs: 600,
            agent1_state: AgentMatchState {
                agent_id: 1,
                balance: 10000.0,
                positions: vec![],
                pnl: 0.0,
                trades_count: 0,
            },
            agent2_state: AgentMatchState {
                agent_id: 2,
                balance: 10000.0,
                positions: vec![],
                pnl: 0.0,
                trades_count: 0,
            },
            prices: HashMap::new(),
        };

        let msg = WsMessage::State { data: state };
        let json = serde_json::to_string(&msg).unwrap();

        assert!(json.contains("\"type\":\"state\""));
    }

    #[test]
    fn test_ws_message_started() {
        let msg = WsMessage::Started;
        let json = serde_json::to_string(&msg).unwrap();

        assert!(json.contains("\"type\":\"started\""));
    }

    #[test]
    fn test_ws_message_ended() {
        let msg = WsMessage::Ended {
            data: MatchEndEvent {
                winner_id: Some(1),
                agent1_pnl: 5000,
                agent2_pnl: -5000,
            },
        };
        let json = serde_json::to_string(&msg).unwrap();

        assert!(json.contains("\"type\":\"ended\""));
        assert!(json.contains("winner_id"));
    }

    #[test]
    fn test_ws_message_error() {
        let msg = WsMessage::Error {
            error: "Something went wrong".to_string(),
        };
        let json = serde_json::to_string(&msg).unwrap();

        assert!(json.contains("\"type\":\"error\""));
        assert!(json.contains("Something went wrong"));
    }

    #[test]
    fn test_match_clone() {
        let m = Match {
            match_id: "test".to_string(),
            agent1_id: 1,
            agent2_id: 2,
            tier: 0,
            entry_fee: 5_000_000,
            prize_pool: 10_000_000,
            agent1_funded: true,
            agent2_funded: true,
            status: MatchStatus::Funded,
            created_at: 12345,
            started_at: None,
            ended_at: None,
            agent1_pnl: None,
            agent2_pnl: None,
            winner_id: None,
        };

        let cloned = m.clone();
        assert_eq!(cloned.match_id, m.match_id);
        assert_eq!(cloned.status, m.status);
    }
}
