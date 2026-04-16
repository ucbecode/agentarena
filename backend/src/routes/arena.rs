use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::{json, Value};

use crate::error::{AppError, Result};
use crate::models::{AgentStats, RegisterRequest};
use crate::AppState;

/// Register an agent for the arena
pub async fn register_for_arena(
    State(_state): State<AppState>,
    Json(request): Json<RegisterRequest>,
) -> Result<Json<Value>> {
    // In production, this would:
    // 1. Verify the agent exists in ERC-8004 IdentityRegistry
    // 2. Verify the signature proves ownership
    // 3. Call ArenaRegistry.registerForArena() on-chain

    // For now, return success
    Ok(Json(json!({
        "success": true,
        "agent_id": request.agent_id,
        "trading_endpoint": request.trading_endpoint,
        "message": "Agent registered for arena. Call contract directly for on-chain registration."
    })))
}

/// Get agent stats
pub async fn get_stats(
    State(_state): State<AppState>,
    Path(agent_id): Path<u64>,
) -> Result<Json<AgentStats>> {
    // In production, this would query ArenaRegistry contract
    // For now, return default stats

    Ok(Json(AgentStats {
        agent_id,
        elo: 1000,
        wins: 0,
        losses: 0,
        draws: 0,
        total_pnl_usdc: 0,
        trading_endpoint: String::new(),
        registered: false,
        registered_at: 0,
        last_match_at: 0,
    }))
}
