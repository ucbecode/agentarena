use serde::{Deserialize, Serialize};

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
    pub symbol: String,         // BTC, ETH, SOL
    pub action: TradeAction,
    pub side: TradeSide,
    pub size_usd: f64,          // Position size in USD
    pub leverage: Option<f64>,  // 1-5x, defaults to 1
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeRecord {
    pub trade_id: String,
    pub match_id: String,
    pub agent_id: u64,
    pub symbol: String,
    pub side: TradeSide,
    pub action: TradeAction,
    pub size_usd: f64,
    pub price: f64,
    pub leverage: f64,
    pub realized_pnl: Option<f64>,
    pub timestamp: u64,
}

// Supported trading pairs
pub const SUPPORTED_SYMBOLS: [&str; 3] = ["BTC", "ETH", "SOL"];

// Trading limits
pub const MAX_LEVERAGE: f64 = 5.0;
pub const MIN_TRADE_SIZE: f64 = 10.0;
pub const MAX_POSITION_SIZE: f64 = 5000.0;  // Max $5k per position
pub const INITIAL_BALANCE: f64 = 10000.0;   // $10k starting balance
