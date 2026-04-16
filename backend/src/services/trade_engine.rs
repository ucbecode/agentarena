use crate::error::{AppError, Result};
use crate::models::{
    AgentMatchState, Position, PositionSide, TradeAction, TradeRecord, TradeRequest,
    TradeResponse, TradeSide, INITIAL_BALANCE, MAX_LEVERAGE, MAX_POSITION_SIZE, MIN_TRADE_SIZE,
    SUPPORTED_SYMBOLS,
};
use crate::services::price_feed::PriceFeed;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Maintenance margin requirement (5% of position value)
const MAINTENANCE_MARGIN_RATIO: f64 = 0.05;

/// Liquidation penalty (2% of position value)
const LIQUIDATION_PENALTY_RATIO: f64 = 0.02;

/// Simulated trade engine for match competitions
pub struct TradeEngine {
    pub price_feed: Arc<PriceFeed>,
    // match_id => agent_id => AgentMatchState
    states: RwLock<HashMap<String, HashMap<u64, AgentMatchState>>>,
    // match_id => Vec<TradeRecord>
    trades: RwLock<HashMap<String, Vec<TradeRecord>>>,
}

impl TradeEngine {
    pub fn new(price_feed: Arc<PriceFeed>) -> Self {
        Self {
            price_feed,
            states: RwLock::new(HashMap::new()),
            trades: RwLock::new(HashMap::new()),
        }
    }

    /// Initialize a match with two agents
    pub async fn init_match(&self, match_id: &str, agent1_id: u64, agent2_id: u64) {
        let mut states = self.states.write().await;

        let mut match_states = HashMap::new();
        match_states.insert(
            agent1_id,
            AgentMatchState {
                agent_id: agent1_id,
                balance: INITIAL_BALANCE,
                positions: vec![],
                pnl: 0.0,
                trades_count: 0,
            },
        );
        match_states.insert(
            agent2_id,
            AgentMatchState {
                agent_id: agent2_id,
                balance: INITIAL_BALANCE,
                positions: vec![],
                pnl: 0.0,
                trades_count: 0,
            },
        );

        states.insert(match_id.to_string(), match_states);

        let mut trades = self.trades.write().await;
        trades.insert(match_id.to_string(), vec![]);
    }

    /// Calculate P&L for a position WITH LEVERAGE applied
    fn calculate_pnl(pos: &Position, current_price: f64) -> f64 {
        let price_change_pct = (current_price - pos.entry_price) / pos.entry_price;
        let pnl = match pos.side {
            PositionSide::Long => price_change_pct * pos.size * pos.leverage,
            PositionSide::Short => -price_change_pct * pos.size * pos.leverage,
        };
        pnl
    }

    /// Calculate margin required for a position
    fn calculate_margin_required(size: f64, leverage: f64) -> f64 {
        size / leverage
    }

    /// Calculate maintenance margin for a position
    fn calculate_maintenance_margin(pos: &Position) -> f64 {
        pos.size * MAINTENANCE_MARGIN_RATIO
    }

    /// Check if agent should be liquidated
    fn should_liquidate(state: &AgentMatchState) -> bool {
        if state.positions.is_empty() {
            return false;
        }

        // Calculate total maintenance margin required
        let total_maintenance: f64 = state.positions
            .iter()
            .map(|p| Self::calculate_maintenance_margin(p))
            .sum();

        // Calculate total unrealized P&L
        let total_unrealized_pnl: f64 = state.positions
            .iter()
            .map(|p| p.unrealized_pnl)
            .sum();

        // Calculate effective equity
        let effective_equity = state.balance + total_unrealized_pnl;

        // Liquidate if equity falls below maintenance margin
        effective_equity < total_maintenance
    }

    /// Execute a trade
    pub async fn execute_trade(
        &self,
        match_id: &str,
        request: TradeRequest,
    ) -> Result<TradeResponse> {
        // Validate symbol
        if !SUPPORTED_SYMBOLS.contains(&request.symbol.as_str()) {
            return Ok(TradeResponse {
                success: false,
                trade_id: String::new(),
                symbol: request.symbol,
                side: request.side,
                action: request.action,
                size_usd: request.size_usd,
                price: 0.0,
                realized_pnl: None,
                new_balance: 0.0,
                error: Some("Unsupported symbol".to_string()),
            });
        }

        // Validate leverage
        let leverage = request.leverage.unwrap_or(1.0).min(MAX_LEVERAGE).max(1.0);

        // Validate size
        if request.size_usd < MIN_TRADE_SIZE {
            return Ok(TradeResponse {
                success: false,
                trade_id: String::new(),
                symbol: request.symbol,
                side: request.side,
                action: request.action,
                size_usd: request.size_usd,
                price: 0.0,
                realized_pnl: None,
                new_balance: 0.0,
                error: Some(format!("Minimum trade size is ${}", MIN_TRADE_SIZE)),
            });
        }

        // Get current price
        let price = self
            .price_feed
            .get_price_or_fetch(&request.symbol)
            .await
            .map_err(|e| AppError::Internal(format!("Price fetch error: {:?}", e)))?;

        let mut states = self.states.write().await;
        let match_states = states
            .get_mut(match_id)
            .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

        let state = match_states
            .get_mut(&request.agent_id)
            .ok_or_else(|| AppError::NotFound("Agent not in match".to_string()))?;

        // Check for liquidation before processing new trade
        if Self::should_liquidate(state) {
            return Ok(TradeResponse {
                success: false,
                trade_id: String::new(),
                symbol: request.symbol,
                side: request.side,
                action: request.action,
                size_usd: request.size_usd,
                price,
                realized_pnl: None,
                new_balance: state.balance,
                error: Some("Agent is in liquidation - cannot open new trades".to_string()),
            });
        }

        let trade_id = Uuid::new_v4().to_string();
        let mut realized_pnl: Option<f64> = None;

        match request.action {
            TradeAction::Open => {
                // Check if already have position in this symbol
                if state.positions.iter().any(|p| p.symbol == request.symbol) {
                    return Ok(TradeResponse {
                        success: false,
                        trade_id,
                        symbol: request.symbol,
                        side: request.side,
                        action: request.action,
                        size_usd: request.size_usd,
                        price,
                        realized_pnl: None,
                        new_balance: state.balance,
                        error: Some("Already have position in this symbol".to_string()),
                    });
                }

                // Check balance (margin required = size / leverage)
                let margin_required = Self::calculate_margin_required(request.size_usd, leverage);
                if margin_required > state.balance {
                    return Ok(TradeResponse {
                        success: false,
                        trade_id,
                        symbol: request.symbol,
                        side: request.side,
                        action: request.action,
                        size_usd: request.size_usd,
                        price,
                        realized_pnl: None,
                        new_balance: state.balance,
                        error: Some(format!(
                            "Insufficient balance. Required: ${:.2}, Available: ${:.2}",
                            margin_required, state.balance
                        )),
                    });
                }

                // Check max position size
                if request.size_usd > MAX_POSITION_SIZE {
                    return Ok(TradeResponse {
                        success: false,
                        trade_id,
                        symbol: request.symbol,
                        side: request.side,
                        action: request.action,
                        size_usd: request.size_usd,
                        price,
                        realized_pnl: None,
                        new_balance: state.balance,
                        error: Some(format!("Max position size is ${}", MAX_POSITION_SIZE)),
                    });
                }

                // Open position
                state.balance -= margin_required;
                state.positions.push(Position {
                    symbol: request.symbol.clone(),
                    side: if request.side == TradeSide::Long {
                        PositionSide::Long
                    } else {
                        PositionSide::Short
                    },
                    size: request.size_usd,
                    entry_price: price,
                    current_price: price,
                    unrealized_pnl: 0.0,
                    leverage,
                });
            }

            TradeAction::Close => {
                // Find and close position
                let pos_idx = state
                    .positions
                    .iter()
                    .position(|p| p.symbol == request.symbol);

                if let Some(idx) = pos_idx {
                    let pos = state.positions.remove(idx);

                    // Calculate P&L WITH LEVERAGE
                    let pnl = Self::calculate_pnl(&pos, price);

                    // Return margin + P&L
                    let margin = Self::calculate_margin_required(pos.size, pos.leverage);
                    state.balance += margin + pnl;
                    state.pnl += pnl;
                    realized_pnl = Some(pnl);
                } else {
                    return Ok(TradeResponse {
                        success: false,
                        trade_id,
                        symbol: request.symbol,
                        side: request.side,
                        action: request.action,
                        size_usd: request.size_usd,
                        price,
                        realized_pnl: None,
                        new_balance: state.balance,
                        error: Some("No position to close".to_string()),
                    });
                }
            }

            TradeAction::Increase => {
                // Find existing position
                let pos = state
                    .positions
                    .iter_mut()
                    .find(|p| p.symbol == request.symbol);

                if let Some(pos) = pos {
                    // Check same direction
                    let is_same_side = (request.side == TradeSide::Long
                        && pos.side == PositionSide::Long)
                        || (request.side == TradeSide::Short && pos.side == PositionSide::Short);

                    if !is_same_side {
                        return Ok(TradeResponse {
                            success: false,
                            trade_id,
                            symbol: request.symbol,
                            side: request.side,
                            action: request.action,
                            size_usd: request.size_usd,
                            price,
                            realized_pnl: None,
                            new_balance: state.balance,
                            error: Some("Cannot increase opposite direction".to_string()),
                        });
                    }

                    // Check margin
                    let margin_required = Self::calculate_margin_required(request.size_usd, leverage);
                    if margin_required > state.balance {
                        return Ok(TradeResponse {
                            success: false,
                            trade_id,
                            symbol: request.symbol,
                            side: request.side,
                            action: request.action,
                            size_usd: request.size_usd,
                            price,
                            realized_pnl: None,
                            new_balance: state.balance,
                            error: Some("Insufficient balance".to_string()),
                        });
                    }

                    // Check max size
                    if pos.size + request.size_usd > MAX_POSITION_SIZE {
                        return Ok(TradeResponse {
                            success: false,
                            trade_id,
                            symbol: request.symbol,
                            side: request.side,
                            action: request.action,
                            size_usd: request.size_usd,
                            price,
                            realized_pnl: None,
                            new_balance: state.balance,
                            error: Some(format!("Max position size is ${}", MAX_POSITION_SIZE)),
                        });
                    }

                    // Calculate new average entry and leverage
                    let old_cost = pos.size;
                    let new_cost = request.size_usd;
                    let total_size = old_cost + new_cost;
                    pos.entry_price =
                        (pos.entry_price * old_cost + price * new_cost) / total_size;

                    // Use weighted average for leverage
                    pos.leverage = (pos.leverage * old_cost + leverage * new_cost) / total_size;
                    pos.size = total_size;

                    state.balance -= margin_required;
                } else {
                    return Ok(TradeResponse {
                        success: false,
                        trade_id,
                        symbol: request.symbol,
                        side: request.side,
                        action: request.action,
                        size_usd: request.size_usd,
                        price,
                        realized_pnl: None,
                        new_balance: state.balance,
                        error: Some("No position to increase".to_string()),
                    });
                }
            }

            TradeAction::Decrease => {
                let pos = state
                    .positions
                    .iter_mut()
                    .find(|p| p.symbol == request.symbol);

                if let Some(pos) = pos {
                    let close_size = request.size_usd.min(pos.size);
                    let close_ratio = close_size / pos.size;

                    // Calculate partial P&L WITH LEVERAGE
                    let partial_pnl = Self::calculate_pnl(pos, price) * close_ratio;

                    // Return partial margin + P&L
                    let margin_return = Self::calculate_margin_required(close_size, pos.leverage);
                    state.balance += margin_return + partial_pnl;
                    state.pnl += partial_pnl;
                    realized_pnl = Some(partial_pnl);

                    pos.size -= close_size;

                    // Remove if fully closed
                    if pos.size < 0.01 {
                        state.positions.retain(|p| p.symbol != request.symbol);
                    }
                } else {
                    return Ok(TradeResponse {
                        success: false,
                        trade_id,
                        symbol: request.symbol,
                        side: request.side,
                        action: request.action,
                        size_usd: request.size_usd,
                        price,
                        realized_pnl: None,
                        new_balance: state.balance,
                        error: Some("No position to decrease".to_string()),
                    });
                }
            }
        }

        state.trades_count += 1;

        // Record trade
        let record = TradeRecord {
            trade_id: trade_id.clone(),
            match_id: match_id.to_string(),
            agent_id: request.agent_id,
            symbol: request.symbol.clone(),
            side: request.side,
            action: request.action,
            size_usd: request.size_usd,
            price,
            leverage,
            realized_pnl,
            timestamp: chrono::Utc::now().timestamp() as u64,
        };

        drop(states); // Release lock before acquiring trades lock

        let mut trades = self.trades.write().await;
        if let Some(match_trades) = trades.get_mut(match_id) {
            match_trades.push(record);
        }

        let states = self.states.read().await;
        let new_balance = states
            .get(match_id)
            .and_then(|m| m.get(&request.agent_id))
            .map(|s| s.balance)
            .unwrap_or(0.0);

        Ok(TradeResponse {
            success: true,
            trade_id,
            symbol: request.symbol,
            side: request.side,
            action: request.action,
            size_usd: request.size_usd,
            price,
            realized_pnl,
            new_balance,
            error: None,
        })
    }

    /// Update all positions with current prices and check for liquidation
    pub async fn update_positions(&self, match_id: &str) -> Result<()> {
        let mut states = self.states.write().await;
        let match_states = states.get_mut(match_id).ok_or_else(|| {
            AppError::NotFound("Match not found".to_string())
        })?;

        for (agent_id, state) in match_states.iter_mut() {
            // Update unrealized P&L for each position
            for pos in &mut state.positions {
                if let Some(price) = self.price_feed.get_price(&pos.symbol).await {
                    pos.current_price = price;
                    // Apply leverage to unrealized P&L
                    pos.unrealized_pnl = Self::calculate_pnl(pos, price);
                }
            }

            // Check for liquidation
            if Self::should_liquidate(state) {
                tracing::warn!(
                    "Agent {} in match {} is being liquidated",
                    agent_id,
                    match_id
                );

                // Force close all positions
                let positions_to_close: Vec<_> = state.positions.drain(..).collect();
                for pos in positions_to_close {
                    let price = self.price_feed.get_price(&pos.symbol).await.unwrap_or(pos.current_price);
                    let pnl = Self::calculate_pnl(&pos, price);
                    let margin = Self::calculate_margin_required(pos.size, pos.leverage);

                    // Apply liquidation penalty
                    let penalty = pos.size * LIQUIDATION_PENALTY_RATIO;

                    state.balance += margin + pnl - penalty;
                    state.pnl += pnl - penalty;
                }
            }
        }

        Ok(())
    }

    /// Get agent state for a match
    pub async fn get_agent_state(&self, match_id: &str, agent_id: u64) -> Option<AgentMatchState> {
        let states = self.states.read().await;
        states
            .get(match_id)
            .and_then(|m| m.get(&agent_id))
            .cloned()
    }

    /// Get both agent states for a match
    pub async fn get_match_states(
        &self,
        match_id: &str,
    ) -> Option<(AgentMatchState, AgentMatchState)> {
        let states = self.states.read().await;
        let match_states = states.get(match_id)?;

        let mut agents: Vec<_> = match_states.values().cloned().collect();
        if agents.len() != 2 {
            return None;
        }

        agents.sort_by_key(|a| a.agent_id);
        Some((agents.remove(0), agents.remove(0)))
    }

    /// Close all positions and calculate final P&L
    pub async fn close_all_positions(&self, match_id: &str) -> Result<(i64, i64)> {
        let mut states = self.states.write().await;
        let match_states = states.get_mut(match_id).ok_or_else(|| {
            AppError::NotFound("Match not found".to_string())
        })?;

        let mut results: Vec<(u64, i64)> = vec![];

        for (agent_id, state) in match_states.iter_mut() {
            // Close each position at current price WITH LEVERAGE
            for pos in state.positions.drain(..) {
                let price = self
                    .price_feed
                    .get_price(&pos.symbol)
                    .await
                    .unwrap_or(pos.current_price);

                let pnl = Self::calculate_pnl(&pos, price);
                let margin = Self::calculate_margin_required(pos.size, pos.leverage);

                state.balance += margin + pnl;
                state.pnl += pnl;
            }

            // Convert to USDC micro units (6 decimals)
            let pnl_usdc = (state.pnl * 1_000_000.0) as i64;
            results.push((*agent_id, pnl_usdc));
        }

        results.sort_by_key(|(id, _)| *id);

        if results.len() != 2 {
            return Err(AppError::Internal("Invalid match state".to_string()));
        }

        Ok((results[0].1, results[1].1))
    }

    /// Get trade history for a match
    pub async fn get_trades(&self, match_id: &str) -> Vec<TradeRecord> {
        let trades = self.trades.read().await;
        trades.get(match_id).cloned().unwrap_or_default()
    }

    /// Clean up match data
    pub async fn cleanup_match(&self, match_id: &str) {
        let mut states = self.states.write().await;
        states.remove(match_id);

        let mut trades = self.trades.write().await;
        trades.remove(match_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_engine() -> TradeEngine {
        let price_feed = Arc::new(PriceFeed::new());
        TradeEngine::new(price_feed)
    }

    #[tokio::test]
    async fn test_init_match() {
        let engine = create_test_engine();
        engine.init_match("test-match", 1, 2).await;

        let state1 = engine.get_agent_state("test-match", 1).await;
        let state2 = engine.get_agent_state("test-match", 2).await;

        assert!(state1.is_some());
        assert!(state2.is_some());

        let state1 = state1.unwrap();
        assert_eq!(state1.balance, INITIAL_BALANCE);
        assert_eq!(state1.pnl, 0.0);
        assert!(state1.positions.is_empty());
    }

    #[test]
    fn test_pnl_calculation_long_with_leverage() {
        let pos = Position {
            symbol: "BTC".to_string(),
            side: PositionSide::Long,
            size: 1000.0,
            entry_price: 50000.0,
            current_price: 52500.0, // 5% increase
            unrealized_pnl: 0.0,
            leverage: 5.0,
        };

        let pnl = TradeEngine::calculate_pnl(&pos, 52500.0);

        // 5% * $1000 * 5x leverage = $250
        assert!((pnl - 250.0).abs() < 0.01);
    }

    #[test]
    fn test_pnl_calculation_short_with_leverage() {
        let pos = Position {
            symbol: "BTC".to_string(),
            side: PositionSide::Short,
            size: 1000.0,
            entry_price: 50000.0,
            current_price: 47500.0, // 5% decrease (profit for short)
            unrealized_pnl: 0.0,
            leverage: 3.0,
        };

        let pnl = TradeEngine::calculate_pnl(&pos, 47500.0);

        // 5% * $1000 * 3x leverage = $150
        assert!((pnl - 150.0).abs() < 0.01);
    }

    #[test]
    fn test_pnl_calculation_long_loss_with_leverage() {
        let pos = Position {
            symbol: "BTC".to_string(),
            side: PositionSide::Long,
            size: 1000.0,
            entry_price: 50000.0,
            current_price: 45000.0, // 10% decrease
            unrealized_pnl: 0.0,
            leverage: 5.0,
        };

        let pnl = TradeEngine::calculate_pnl(&pos, 45000.0);

        // -10% * $1000 * 5x leverage = -$500
        assert!((pnl + 500.0).abs() < 0.01);
    }

    #[test]
    fn test_margin_calculation() {
        let margin = TradeEngine::calculate_margin_required(5000.0, 5.0);
        assert_eq!(margin, 1000.0); // $5000 at 5x = $1000 margin

        let margin = TradeEngine::calculate_margin_required(10000.0, 1.0);
        assert_eq!(margin, 10000.0); // $10000 at 1x = $10000 margin
    }

    #[test]
    fn test_maintenance_margin_calculation() {
        let pos = Position {
            symbol: "BTC".to_string(),
            side: PositionSide::Long,
            size: 1000.0,
            entry_price: 50000.0,
            current_price: 50000.0,
            unrealized_pnl: 0.0,
            leverage: 5.0,
        };

        let maintenance = TradeEngine::calculate_maintenance_margin(&pos);
        assert_eq!(maintenance, 50.0); // 5% of $1000 = $50
    }

    #[test]
    fn test_should_liquidate_healthy() {
        let state = AgentMatchState {
            agent_id: 1,
            balance: 5000.0,
            positions: vec![
                Position {
                    symbol: "BTC".to_string(),
                    side: PositionSide::Long,
                    size: 1000.0,
                    entry_price: 50000.0,
                    current_price: 50000.0,
                    unrealized_pnl: 0.0,
                    leverage: 5.0,
                }
            ],
            pnl: 0.0,
            trades_count: 1,
        };

        // Balance ($5000) >> maintenance margin ($50)
        assert!(!TradeEngine::should_liquidate(&state));
    }

    #[test]
    fn test_should_liquidate_underwater() {
        let state = AgentMatchState {
            agent_id: 1,
            balance: 10.0, // Very low balance
            positions: vec![
                Position {
                    symbol: "BTC".to_string(),
                    side: PositionSide::Long,
                    size: 1000.0,
                    entry_price: 50000.0,
                    current_price: 45000.0, // 10% loss
                    unrealized_pnl: -500.0, // -$500 with 5x leverage
                    leverage: 5.0,
                }
            ],
            pnl: 0.0,
            trades_count: 1,
        };

        // Effective equity: $10 - $500 = -$490, maintenance = $50
        assert!(TradeEngine::should_liquidate(&state));
    }

    #[tokio::test]
    async fn test_unsupported_symbol() {
        let engine = create_test_engine();
        engine.init_match("test-match", 1, 2).await;

        let request = TradeRequest {
            agent_id: 1,
            symbol: "INVALID".to_string(),
            action: TradeAction::Open,
            side: TradeSide::Long,
            size_usd: 1000.0,
            leverage: Some(2.0),
        };

        let response = engine.execute_trade("test-match", request).await.unwrap();
        assert!(!response.success);
        assert!(response.error.unwrap().contains("Unsupported"));
    }

    #[tokio::test]
    async fn test_min_trade_size() {
        let engine = create_test_engine();
        engine.init_match("test-match", 1, 2).await;

        let request = TradeRequest {
            agent_id: 1,
            symbol: "BTC".to_string(),
            action: TradeAction::Open,
            side: TradeSide::Long,
            size_usd: 0.5, // Below MIN_TRADE_SIZE
            leverage: Some(1.0),
        };

        let response = engine.execute_trade("test-match", request).await.unwrap();
        assert!(!response.success);
        assert!(response.error.unwrap().contains("Minimum"));
    }

    #[tokio::test]
    async fn test_max_leverage_capped() {
        // Test that leverage is capped at MAX_LEVERAGE
        let requested_leverage: f64 = 10.0;
        let capped = requested_leverage.min(MAX_LEVERAGE).max(1.0);
        assert_eq!(capped, MAX_LEVERAGE);
    }

    #[tokio::test]
    async fn test_close_nonexistent_position() {
        let engine = create_test_engine();
        engine.init_match("test-match", 1, 2).await;

        let request = TradeRequest {
            agent_id: 1,
            symbol: "BTC".to_string(),
            action: TradeAction::Close,
            side: TradeSide::Long,
            size_usd: 1000.0,
            leverage: None,
        };

        let response = engine.execute_trade("test-match", request).await.unwrap();
        assert!(!response.success);
        assert!(response.error.unwrap().contains("No position"));
    }

    #[tokio::test]
    async fn test_match_not_found() {
        let engine = create_test_engine();

        let request = TradeRequest {
            agent_id: 1,
            symbol: "BTC".to_string(),
            action: TradeAction::Open,
            side: TradeSide::Long,
            size_usd: 1000.0,
            leverage: Some(2.0),
        };

        let result = engine.execute_trade("nonexistent", request).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_get_match_states() {
        let engine = create_test_engine();
        engine.init_match("test-match", 1, 2).await;

        let states = engine.get_match_states("test-match").await;
        assert!(states.is_some());

        let (state1, state2) = states.unwrap();
        assert_eq!(state1.agent_id, 1);
        assert_eq!(state2.agent_id, 2);
    }

    #[tokio::test]
    async fn test_cleanup_match() {
        let engine = create_test_engine();
        engine.init_match("test-match", 1, 2).await;

        // Verify match exists
        assert!(engine.get_agent_state("test-match", 1).await.is_some());

        engine.cleanup_match("test-match").await;

        // Verify match is cleaned up
        assert!(engine.get_agent_state("test-match", 1).await.is_none());
    }
}
