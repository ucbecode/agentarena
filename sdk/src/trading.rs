use crate::models::{MatchState, Position, PositionSide, TradeAction, TradeRequest, TradeSide};

/// Trading strategy helper
pub struct TradingStrategy {
    pub agent_id: u64,
    pub max_position_size: f64,
    pub max_leverage: f64,
    pub risk_per_trade: f64, // As fraction of balance
}

impl TradingStrategy {
    pub fn new(agent_id: u64) -> Self {
        Self {
            agent_id,
            max_position_size: 5000.0,
            max_leverage: 3.0,
            risk_per_trade: 0.1, // 10% of balance per trade
        }
    }

    /// Calculate position size based on risk
    pub fn calculate_size(&self, balance: f64, leverage: f64) -> f64 {
        let risk_amount = balance * self.risk_per_trade;
        let size = risk_amount * leverage;
        size.min(self.max_position_size)
    }

    /// Check if we have an open position in a symbol
    pub fn has_position(&self, state: &MatchState, symbol: &str) -> bool {
        let agent_state = if state.agent1_state.agent_id == self.agent_id {
            &state.agent1_state
        } else {
            &state.agent2_state
        };

        agent_state.positions.iter().any(|p| p.symbol == symbol)
    }

    /// Get current position for a symbol
    pub fn get_position<'a>(&self, state: &'a MatchState, symbol: &str) -> Option<&'a Position> {
        let agent_state = if state.agent1_state.agent_id == self.agent_id {
            &state.agent1_state
        } else {
            &state.agent2_state
        };

        agent_state.positions.iter().find(|p| p.symbol == symbol)
    }

    /// Get current balance
    pub fn get_balance(&self, state: &MatchState) -> f64 {
        if state.agent1_state.agent_id == self.agent_id {
            state.agent1_state.balance
        } else {
            state.agent2_state.balance
        }
    }

    /// Get current P&L
    pub fn get_pnl(&self, state: &MatchState) -> f64 {
        if state.agent1_state.agent_id == self.agent_id {
            state.agent1_state.pnl
        } else {
            state.agent2_state.pnl
        }
    }

    /// Create a trade request to open a long position
    pub fn open_long(&self, symbol: &str, size: f64, leverage: f64) -> TradeRequest {
        TradeRequest {
            agent_id: self.agent_id,
            symbol: symbol.to_string(),
            action: TradeAction::Open,
            side: TradeSide::Long,
            size_usd: size.min(self.max_position_size),
            leverage: Some(leverage.min(self.max_leverage)),
        }
    }

    /// Create a trade request to open a short position
    pub fn open_short(&self, symbol: &str, size: f64, leverage: f64) -> TradeRequest {
        TradeRequest {
            agent_id: self.agent_id,
            symbol: symbol.to_string(),
            action: TradeAction::Open,
            side: TradeSide::Short,
            size_usd: size.min(self.max_position_size),
            leverage: Some(leverage.min(self.max_leverage)),
        }
    }

    /// Create a trade request to close a position
    pub fn close_position(&self, symbol: &str) -> TradeRequest {
        TradeRequest {
            agent_id: self.agent_id,
            symbol: symbol.to_string(),
            action: TradeAction::Close,
            side: TradeSide::Long, // Side doesn't matter for close
            size_usd: 0.0,         // Will close entire position
            leverage: None,
        }
    }

    /// Calculate total unrealized P&L
    pub fn total_unrealized_pnl(&self, state: &MatchState) -> f64 {
        let agent_state = if state.agent1_state.agent_id == self.agent_id {
            &state.agent1_state
        } else {
            &state.agent2_state
        };

        agent_state
            .positions
            .iter()
            .map(|p| p.unrealized_pnl)
            .sum()
    }

    /// Get opponent's P&L for comparison
    pub fn opponent_pnl(&self, state: &MatchState) -> f64 {
        if state.agent1_state.agent_id == self.agent_id {
            state.agent2_state.pnl
        } else {
            state.agent1_state.pnl
        }
    }
}

/// Simple momentum signal calculator
pub fn calculate_momentum(prices: &[(f64, u64)], lookback: usize) -> f64 {
    if prices.len() < lookback + 1 {
        return 0.0;
    }

    let current = prices.last().map(|(p, _)| *p).unwrap_or(0.0);
    let past = prices
        .get(prices.len() - lookback - 1)
        .map(|(p, _)| *p)
        .unwrap_or(current);

    if past == 0.0 {
        return 0.0;
    }

    (current - past) / past * 100.0 // Return as percentage
}

/// Simple moving average calculator
pub fn calculate_sma(prices: &[f64], period: usize) -> Option<f64> {
    if prices.len() < period {
        return None;
    }

    let sum: f64 = prices.iter().rev().take(period).sum();
    Some(sum / period as f64)
}
