use axum::{
    extract::{Path, State},
    http::HeaderMap,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};
use crate::models::{
    AcceptChallengeRequest, ChallengeRequest, ChallengeResponse, Match, MatchState, MatchStatus,
    TradeRequest, TradeResponse, X402PaymentProof,
};
use crate::AppState;

/// Response for match statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchStats {
    pub total_matches: usize,
    pub active_matches: usize,
    pub total_volume: u64,
}

/// Create a challenge to another agent
pub async fn create_challenge(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ChallengeRequest>,
) -> Result<Json<ChallengeResponse>> {
    // Check for payment proof header
    let payment_proof = headers
        .get("X-Payment-Proof")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| serde_json::from_str::<X402PaymentProof>(s).ok());

    // Create the match
    let m = state
        .match_service
        .create_challenge(request.challenger_id, request.challenged_id, request.tier)
        .await?;

    // If no payment proof, return 402 with payment request
    if payment_proof.is_none() {
        let payment_request = state
            .x402_service
            .create_payment_request(
                m.entry_fee,
                state.x402_service.platform_wallet(),
                Some(m.match_id.clone()),
                Some(request.challenger_id),
                Some(format!(
                    "Entry fee for match vs agent {}",
                    request.challenged_id
                )),
            )
            .await?;

        return Err(AppError::PaymentRequired(serde_json::to_value(&payment_request).unwrap()));
    }

    // Verify payment
    let proof = payment_proof.unwrap();
    let verification = state.x402_service.verify_payment(&proof).await?;

    if !verification.valid {
        return Err(AppError::BadRequest(
            verification.error.unwrap_or_else(|| "Payment verification failed".to_string()),
        ));
    }

    // Mark challenger as funded
    let m = state
        .match_service
        .fund_match(&m.match_id, request.challenger_id)
        .await?;

    Ok(Json(ChallengeResponse {
        match_id: m.match_id,
        entry_fee: m.entry_fee,
        payment_required: None,
    }))
}

/// Accept a challenge
pub async fn accept_challenge(
    State(state): State<AppState>,
    Path(match_id): Path<String>,
    headers: HeaderMap,
    Json(request): Json<AcceptChallengeRequest>,
) -> Result<Json<Match>> {
    // Get match to check entry fee
    let m = state
        .match_service
        .get_match(&match_id)
        .await
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    if request.agent_id != m.agent2_id {
        return Err(AppError::BadRequest(
            "Only the challenged agent can accept".to_string(),
        ));
    }

    // Check for payment proof
    let payment_proof = headers
        .get("X-Payment-Proof")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| serde_json::from_str::<X402PaymentProof>(s).ok());

    if payment_proof.is_none() && !m.agent2_funded {
        let payment_request = state
            .x402_service
            .create_payment_request(
                m.entry_fee,
                state.x402_service.platform_wallet(),
                Some(match_id.clone()),
                Some(request.agent_id),
                Some(format!("Entry fee for match vs agent {}", m.agent1_id)),
            )
            .await?;

        return Err(AppError::PaymentRequired(serde_json::to_value(&payment_request).unwrap()));
    }

    // Verify payment if provided
    if let Some(proof) = payment_proof {
        let verification = state.x402_service.verify_payment(&proof).await?;
        if !verification.valid {
            return Err(AppError::BadRequest(
                verification.error.unwrap_or_else(|| "Payment verification failed".to_string()),
            ));
        }

        // Mark agent2 as funded
        state
            .match_service
            .fund_match(&match_id, request.agent_id)
            .await?;
    }

    // Accept and start match
    let m = state.match_service.accept_challenge(&match_id).await?;

    Ok(Json(m))
}

/// Submit a trade during a match
pub async fn submit_trade(
    State(state): State<AppState>,
    Path(match_id): Path<String>,
    Json(request): Json<TradeRequest>,
) -> Result<Json<TradeResponse>> {
    // Verify match exists and is in progress
    let m = state
        .match_service
        .get_match(&match_id)
        .await
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    if m.status != MatchStatus::InProgress {
        return Err(AppError::BadRequest("Match not in progress".to_string()));
    }

    // Verify agent is in this match
    if request.agent_id != m.agent1_id && request.agent_id != m.agent2_id {
        return Err(AppError::BadRequest("Agent not in this match".to_string()));
    }

    // Extract values before move
    let agent_id = request.agent_id;
    let leverage = request.leverage.unwrap_or(1.0);

    // Execute trade
    let response = state
        .trade_engine
        .execute_trade(&match_id, request)
        .await?;

    // Broadcast trade update
    if response.success {
        use crate::services::match_service::MatchUpdate;

        // Get agent's new total P&L
        let agent_state = state
            .trade_engine
            .get_agent_state(&match_id, agent_id)
            .await;
        let new_pnl = agent_state.map(|s| s.pnl).unwrap_or(0.0);

        state
            .match_service
            .broadcast_update(
                &match_id,
                MatchUpdate::TradeExecuted {
                    agent_id,
                    trade_id: response.trade_id.clone(),
                    symbol: response.symbol.clone(),
                    action: format!("{:?}", response.action),
                    side: format!("{:?}", response.side),
                    size: response.size_usd,
                    price: response.price,
                    leverage,
                    realized_pnl: response.realized_pnl,
                    new_balance: response.new_balance,
                    new_pnl,
                    timestamp: chrono::Utc::now().timestamp() as u64,
                },
            )
            .await;
    }

    Ok(Json(response))
}

/// Get current match state
pub async fn get_match_state(
    State(state): State<AppState>,
    Path(match_id): Path<String>,
) -> Result<Json<MatchState>> {
    // Update positions with current prices
    let _ = state.trade_engine.update_positions(&match_id).await;

    let match_state = state.match_service.get_match_state(&match_id).await?;
    Ok(Json(match_state))
}

/// Get match details
pub async fn get_match(
    State(state): State<AppState>,
    Path(match_id): Path<String>,
) -> Result<Json<Match>> {
    let m = state
        .match_service
        .get_match(&match_id)
        .await
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    Ok(Json(m))
}

/// Get trade history for a match
pub async fn get_trade_history(
    State(state): State<AppState>,
    Path(match_id): Path<String>,
) -> Result<Json<Vec<crate::models::TradeRecord>>> {
    // Verify match exists
    let _ = state
        .match_service
        .get_match(&match_id)
        .await
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    let trades = state.trade_engine.get_trades(&match_id).await;
    Ok(Json(trades))
}

/// List all matches
pub async fn list_matches(State(state): State<AppState>) -> Result<Json<Vec<Match>>> {
    let matches = state.match_service.list_all_matches().await;
    Ok(Json(matches))
}

/// Get match statistics
pub async fn get_stats(State(state): State<AppState>) -> Result<Json<MatchStats>> {
    let (total_matches, active_matches, total_volume) = state.match_service.get_stats().await;
    Ok(Json(MatchStats {
        total_matches,
        active_matches,
        total_volume,
    }))
}
