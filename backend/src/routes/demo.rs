use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::error::AppError;
use crate::models::{TradeAction, TradeRequest, TradeSide};
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateDemoMatchRequest {
    pub agent1_id: Option<u64>,
    pub agent2_id: Option<u64>,
    pub tier: Option<u64>,
    pub duration: Option<u64>, // Shorter duration for demo (seconds)
}

#[derive(Debug, Serialize)]
pub struct DemoMatchResponse {
    pub match_id: String,
    pub agent1_id: u64,
    pub agent2_id: u64,
    pub status: String,
    pub message: String,
}

fn app_error_to_string(e: AppError) -> String {
    match e {
        AppError::BadRequest(msg) => msg,
        AppError::NotFound(msg) => msg,
        AppError::Unauthorized(msg) => msg,
        AppError::Conflict(msg) => msg,
        AppError::Internal(msg) => msg,
        AppError::PaymentRequired(_) => "Payment required".to_string(),
    }
}

/// Create a demo match without authentication
/// POST /api/demo/create-match
pub async fn create_demo_match(
    State(state): State<AppState>,
    Json(req): Json<CreateDemoMatchRequest>,
) -> Result<Json<DemoMatchResponse>, (StatusCode, String)> {
    let agent1_id = req.agent1_id.unwrap_or(42);
    let agent2_id = req.agent2_id.unwrap_or(77);
    let tier = req.tier.unwrap_or(2); // Silver tier by default

    tracing::info!(
        "Creating demo match: Agent #{} vs Agent #{}, tier {}",
        agent1_id,
        agent2_id,
        tier
    );

    // Create the match
    let match_result = state
        .match_service
        .create_challenge(agent1_id, agent2_id, tier)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, app_error_to_string(e)))?;

    let match_id = match_result.match_id.clone();

    // Auto-fund both agents
    state
        .match_service
        .fund_match(&match_id, agent1_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, app_error_to_string(e)))?;

    state
        .match_service
        .fund_match(&match_id, agent2_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, app_error_to_string(e)))?;

    // Start the match
    state
        .match_service
        .accept_challenge(&match_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, app_error_to_string(e)))?;

    tracing::info!("Demo match {} started!", match_id);

    // Spawn simulated trading activity
    let match_id_clone = match_id.clone();
    let trade_engine = state.trade_engine.clone();
    let match_service = state.match_service.clone();

    tokio::spawn(async move {
        simulate_trading(match_id_clone, agent1_id, agent2_id, trade_engine, match_service).await;
    });

    Ok(Json(DemoMatchResponse {
        match_id: match_id.clone(),
        agent1_id,
        agent2_id,
        status: "in_progress".to_string(),
        message: format!(
            "Demo match started! Watch at http://localhost:3461/matches/{}",
            match_id
        ),
    }))
}

/// Simulate trading activity for demo purposes
async fn simulate_trading(
    match_id: String,
    agent1_id: u64,
    agent2_id: u64,
    trade_engine: Arc<crate::services::trade_engine::TradeEngine>,
    match_service: Arc<crate::services::match_service::MatchService>,
) {
    use rand::{Rng, SeedableRng};
    use rand::rngs::StdRng;
    use tokio::time::{sleep, Duration};
    use std::collections::HashMap;

    tracing::info!(
        "Starting demo trading simulation for match {} (agents {} vs {})",
        match_id, agent1_id, agent2_id
    );

    let symbols = ["BTC", "ETH", "SOL"];
    let mut rng = StdRng::from_entropy();

    // Track open positions per agent: agent_id => symbol => side
    let mut open_positions: HashMap<u64, HashMap<String, TradeSide>> = HashMap::new();
    open_positions.insert(agent1_id, HashMap::new());
    open_positions.insert(agent2_id, HashMap::new());

    // Trade every 3-8 seconds for the duration of the match
    for trade_num in 0..50 {
        // Wait random interval
        let wait_secs = rng.gen_range(3..8);
        sleep(Duration::from_secs(wait_secs)).await;

        // Check if match is still in progress
        if let Some(m) = match_service.get_match(&match_id).await {
            if m.status != crate::models::MatchStatus::InProgress {
                tracing::info!("Demo match {} ended, stopping simulation", match_id);
                break;
            }
        } else {
            break;
        }

        // Pick random agent and trade parameters
        let agent_id = if rng.gen_bool(0.5) {
            agent1_id
        } else {
            agent2_id
        };
        let symbol = symbols[rng.gen_range(0..symbols.len())].to_string();

        // Get agent's current positions
        let agent_positions = open_positions.get(&agent_id).cloned().unwrap_or_default();
        let has_position = agent_positions.contains_key(&symbol);

        // Decide action based on whether we have a position
        let (action, side) = if has_position {
            // 70% chance to close if we have a position
            if rng.gen_bool(0.7) {
                let existing_side = agent_positions.get(&symbol).unwrap().clone();
                (TradeAction::Close, existing_side)
            } else {
                // Keep the position, skip this trade
                continue;
            }
        } else {
            // Open a new position
            let side = if rng.gen_bool(0.5) {
                TradeSide::Long
            } else {
                TradeSide::Short
            };
            (TradeAction::Open, side)
        };

        let size = rng.gen_range(500.0..2000.0);
        let leverage = rng.gen_range(1.0..3.0);

        let request = TradeRequest {
            agent_id,
            symbol: symbol.clone(),
            side: side.clone(),
            action: action.clone(),
            size_usd: size,
            leverage: Some(leverage),
        };

        tracing::info!(
            "Demo trade #{} attempting: Agent #{} {:?} {:?} ${:.0} {} (leverage: {:.1}x)",
            trade_num + 1, agent_id, action, side, size, symbol, leverage
        );

        // Execute the trade
        match trade_engine.execute_trade(&match_id, request).await {
            Ok(response) => {
                if response.success {
                    tracing::info!(
                        "Demo trade #{} SUCCESS: Agent #{} {:?} {:?} ${:.0} {} @ ${:.2} | P&L: {:?} | Balance: ${:.2}",
                        trade_num + 1,
                        agent_id,
                        action,
                        side,
                        size,
                        symbol,
                        response.price,
                        response.realized_pnl,
                        response.new_balance
                    );

                    // Update position tracking
                    if let Some(agent_pos) = open_positions.get_mut(&agent_id) {
                        match action {
                            TradeAction::Open => {
                                agent_pos.insert(symbol.clone(), side.clone());
                            }
                            TradeAction::Close => {
                                agent_pos.remove(&symbol);
                            }
                            _ => {}
                        }
                    }

                    // Broadcast the trade update
                    match_service
                        .broadcast_update(
                            &match_id,
                            crate::services::match_service::MatchUpdate::TradeExecuted {
                                agent_id,
                                trade_id: response.trade_id,
                                symbol: symbol.clone(),
                                action: format!("{:?}", action),
                                side: format!("{:?}", side),
                                size,
                                price: response.price,
                                leverage,
                                realized_pnl: response.realized_pnl,
                                new_balance: response.new_balance,
                                new_pnl: 0.0, // Will be calculated from state
                                timestamp: chrono::Utc::now().timestamp() as u64,
                            },
                        )
                        .await;
                } else {
                    tracing::warn!(
                        "Demo trade #{} FAILED: Agent #{} {:?} {} - {}",
                        trade_num + 1, agent_id, action, symbol,
                        response.error.unwrap_or_else(|| "Unknown error".to_string())
                    );
                }
            }
            Err(e) => {
                tracing::error!("Demo trade #{} ERROR: Agent #{} {:?} {} - {:?}",
                    trade_num + 1, agent_id, action, symbol, e);
            }
        }
    }

    tracing::info!("Demo trading simulation completed for match {}", match_id);
}

/// Get list of active demo matches
/// GET /api/demo/matches
pub async fn list_demo_matches(
    State(_state): State<AppState>,
) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "message": "Use POST /api/demo/create-match to create a demo match"
    }))
}

#[derive(Debug, Deserialize)]
pub struct EndMatchRequest {
    pub match_id: String,
    pub submit_onchain: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct EndMatchResponse {
    pub match_id: String,
    pub status: String,
    pub agent1_pnl: i64,
    pub agent2_pnl: i64,
    pub winner_id: Option<u64>,
    pub onchain_tx: Option<String>,
}

/// End a demo match early and optionally submit results on-chain
/// POST /api/demo/end-match
pub async fn end_demo_match(
    State(state): State<AppState>,
    Json(req): Json<EndMatchRequest>,
) -> Result<Json<EndMatchResponse>, (StatusCode, String)> {
    // End the match
    let m = state
        .match_service
        .end_match(&req.match_id)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, app_error_to_string(e)))?;

    let agent1_pnl = m.agent1_pnl.unwrap_or(0);
    let agent2_pnl = m.agent2_pnl.unwrap_or(0);

    // Submit on-chain if requested
    let onchain_tx = if req.submit_onchain.unwrap_or(false) {
        match state
            .oracle_service
            .submit_result(&req.match_id, agent1_pnl, agent2_pnl)
            .await
        {
            Ok(tx) => {
                tracing::info!("Submitted match {} result on-chain: {}", req.match_id, tx);
                Some(tx)
            }
            Err(e) => {
                tracing::warn!("Failed to submit on-chain: {:?}", e);
                None
            }
        }
    } else {
        None
    };

    Ok(Json(EndMatchResponse {
        match_id: m.match_id,
        status: format!("{:?}", m.status),
        agent1_pnl,
        agent2_pnl,
        winner_id: m.winner_id,
        onchain_tx,
    }))
}

#[derive(Debug, Deserialize)]
pub struct OnchainMatchRequest {
    pub agent1_id: Option<u64>,
    pub agent2_id: Option<u64>,
    pub tier: Option<u64>,
    pub duration_secs: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct OnchainMatchResponse {
    pub match_id: String,
    pub agent1_id: u64,
    pub agent2_id: u64,
    pub status: String,
    pub onchain_txs: Vec<String>,
    pub explorer_url: String,
}

/// Create a full on-chain demo match
/// POST /api/demo/onchain-match
pub async fn create_onchain_match(
    State(state): State<AppState>,
    Json(req): Json<OnchainMatchRequest>,
) -> Result<Json<OnchainMatchResponse>, (StatusCode, String)> {
    // Generate unique agent IDs
    let suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() % 100000;
    let agent1_id = req.agent1_id.unwrap_or(10000 + suffix);
    let agent2_id = req.agent2_id.unwrap_or(20000 + suffix);
    let tier = req.tier.unwrap_or(0); // Free tier
    let duration_secs = req.duration_secs.unwrap_or(10); // 10 second match for testing

    tracing::info!(
        "Creating on-chain match: Agent #{} vs Agent #{}, tier {}, duration {}s",
        agent1_id, agent2_id, tier, duration_secs
    );

    let mut txs = Vec::new();

    // Set match duration for testing
    if let Err(e) = state.oracle_service.set_match_duration(duration_secs).await {
        tracing::warn!("Failed to set match duration: {:?}", e);
    }

    // Create full on-chain match
    let match_id = state
        .oracle_service
        .create_full_onchain_match(agent1_id, agent2_id, tier)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("On-chain error: {:?}", e)))?;

    txs.push(format!("Match created: {}", match_id));

    // Create backend match with same ID as on-chain
    if let Err(e) = state
        .match_service
        .create_match_with_id(&match_id, agent1_id, agent2_id, tier)
        .await
    {
        tracing::warn!("Failed to create backend match: {:?}", e);
    }

    // Fund and start backend match
    if let Err(e) = state.match_service.fund_match(&match_id, agent1_id).await {
        tracing::warn!("Failed to fund agent1: {:?}", e);
    }
    if let Err(e) = state.match_service.fund_match(&match_id, agent2_id).await {
        tracing::warn!("Failed to fund agent2: {:?}", e);
    }
    if let Err(e) = state.match_service.accept_challenge(&match_id).await {
        tracing::warn!("Failed to start backend match: {:?}", e);
    }

    // Start simulated trading
    let match_id_clone = match_id.clone();
    let trade_engine = state.trade_engine.clone();
    let match_service = state.match_service.clone();
    let oracle_service = state.oracle_service.clone();

    tokio::spawn(async move {
        // Run trading simulation for the duration
        simulate_onchain_trading(
            match_id_clone,
            agent1_id,
            agent2_id,
            duration_secs,
            trade_engine,
            match_service,
            oracle_service,
        )
        .await;
    });

    let explorer_url = format!(
        "https://www.okx.com/explorer/xlayer-test/address/{}",
        std::env::var("MATCH_MANAGER").unwrap_or_default()
    );

    Ok(Json(OnchainMatchResponse {
        match_id,
        agent1_id,
        agent2_id,
        status: "trading".to_string(),
        onchain_txs: txs,
        explorer_url,
    }))
}

/// Simulate trading and then submit results on-chain
async fn simulate_onchain_trading(
    match_id: String,
    agent1_id: u64,
    agent2_id: u64,
    duration_secs: u64,
    trade_engine: std::sync::Arc<crate::services::trade_engine::TradeEngine>,
    match_service: std::sync::Arc<crate::services::match_service::MatchService>,
    oracle_service: std::sync::Arc<crate::services::oracle_service::OracleService>,
) {
    use rand::{Rng, SeedableRng};
    use rand::rngs::StdRng;
    use tokio::time::{sleep, Duration};

    tracing::info!(
        "Starting on-chain trading simulation for match {} ({} seconds)",
        match_id, duration_secs
    );

    let symbols = ["BTC", "ETH", "SOL"];
    let mut rng = StdRng::from_entropy();
    let start_time = std::time::Instant::now();

    // Trade for the duration
    let mut trade_num = 0;
    while start_time.elapsed().as_secs() < duration_secs {
        trade_num += 1;

        // Wait 1-2 seconds between trades
        sleep(Duration::from_millis(rng.gen_range(1000..2000))).await;

        // Pick random agent
        let agent_id = if rng.gen_bool(0.5) { agent1_id } else { agent2_id };
        let symbol = symbols[rng.gen_range(0..symbols.len())].to_string();
        let side = if rng.gen_bool(0.5) {
            crate::models::TradeSide::Long
        } else {
            crate::models::TradeSide::Short
        };
        let size = rng.gen_range(500.0..1500.0);

        let request = crate::models::TradeRequest {
            agent_id,
            symbol: symbol.clone(),
            side: side.clone(),
            action: crate::models::TradeAction::Open,
            size_usd: size,
            leverage: Some(rng.gen_range(1.0..2.5)),
        };

        if let Ok(response) = trade_engine.execute_trade(&match_id, request).await {
            if response.success {
                tracing::info!(
                    "On-chain match trade #{}: Agent #{} {:?} ${:.0} {} @ ${:.2}",
                    trade_num, agent_id, side, size, symbol, response.price
                );
            }
        }
    }

    tracing::info!("Trading phase complete for match {}, settling...", match_id);

    // End match in backend
    let backend_result = match_service.end_match(&match_id).await;
    let (agent1_pnl, agent2_pnl) = match backend_result {
        Ok(m) => (m.agent1_pnl.unwrap_or(0), m.agent2_pnl.unwrap_or(0)),
        Err(e) => {
            tracing::error!("Failed to end backend match: {:?}", e);
            (0, 0)
        }
    };

    tracing::info!(
        "Match {} results: Agent #{} P&L: {}, Agent #{} P&L: {}",
        match_id, agent1_id, agent1_pnl, agent2_id, agent2_pnl
    );

    // Wait a moment for on-chain match duration to definitely expire
    sleep(Duration::from_secs(2)).await;

    // Submit results on-chain
    match oracle_service
        .complete_onchain_match(&match_id, agent1_pnl, agent2_pnl)
        .await
    {
        Ok(tx) => {
            tracing::info!(
                "On-chain match {} settled! TX: {}",
                match_id, tx
            );
        }
        Err(e) => {
            tracing::error!("Failed to settle on-chain: {:?}", e);
        }
    }
}
