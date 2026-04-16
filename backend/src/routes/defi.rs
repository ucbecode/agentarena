use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::services::onchainos_service::{
    DeFiInsight, PoolInfo, SwapQuote, SwapRoute, UniswapAction, UniswapSkillRequest,
    ETHEREUM_CHAIN_ID,
};
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct SwapQuoteQuery {
    pub chain_id: Option<String>,
    pub from_token: String,
    pub to_token: String,
    pub amount: String,
    pub slippage: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct PoolInfoQuery {
    pub chain_id: Option<String>,
    pub token0: String,
    pub token1: String,
}

#[derive(Debug, Serialize)]
pub struct DeFiSkillResponse {
    pub success: bool,
    pub skill: String,
    pub data: serde_json::Value,
    pub timestamp: u64,
}

/// Get Uniswap swap quote
/// GET /api/defi/quote?from_token=USDC&to_token=ETH&amount=1000000000
pub async fn get_swap_quote(
    State(state): State<AppState>,
    Query(query): Query<SwapQuoteQuery>,
) -> Result<Json<SwapQuote>> {
    let chain_id = query.chain_id.as_deref().unwrap_or(ETHEREUM_CHAIN_ID);
    let slippage = query.slippage.unwrap_or(0.5);

    let quote = state
        .onchainos_service
        .get_swap_quote(chain_id, &query.from_token, &query.to_token, &query.amount, slippage)
        .await?;

    Ok(Json(quote))
}

/// Get best swap route
/// GET /api/defi/route?from_token=USDC&to_token=ETH&amount=1000000000
pub async fn get_swap_route(
    State(state): State<AppState>,
    Query(query): Query<SwapQuoteQuery>,
) -> Result<Json<Vec<SwapRoute>>> {
    let chain_id = query.chain_id.as_deref().unwrap_or(ETHEREUM_CHAIN_ID);

    let routes = state
        .onchainos_service
        .get_best_route(chain_id, &query.from_token, &query.to_token, &query.amount)
        .await?;

    Ok(Json(routes))
}

/// Get pool information
/// GET /api/defi/pools?token0=WETH&token1=USDC
pub async fn get_pools(
    State(state): State<AppState>,
    Query(query): Query<PoolInfoQuery>,
) -> Result<Json<Vec<PoolInfo>>> {
    let chain_id = query.chain_id.as_deref().unwrap_or(ETHEREUM_CHAIN_ID);

    let pools = state
        .onchainos_service
        .get_pool_info(chain_id, &query.token0, &query.token1)
        .await?;

    Ok(Json(pools))
}

/// Get DeFi insights for a symbol
/// GET /api/defi/insights/ETH
pub async fn get_defi_insights(
    State(state): State<AppState>,
    Path(symbol): Path<String>,
) -> Result<Json<Vec<DeFiInsight>>> {
    let insights = state.onchainos_service.get_defi_insights(&symbol).await?;
    Ok(Json(insights))
}

/// Execute Uniswap skill (for AI agents)
/// POST /api/defi/skill
pub async fn execute_uniswap_skill(
    State(state): State<AppState>,
    Json(request): Json<UniswapSkillRequest>,
) -> Result<Json<DeFiSkillResponse>> {
    let result = state.onchainos_service.execute_uniswap_skill(request.clone()).await?;

    let skill_name = match request.action {
        UniswapAction::Quote => "uniswap_quote",
        UniswapAction::Route => "uniswap_route",
        UniswapAction::PoolInfo => "uniswap_pool_info",
        UniswapAction::PriceImpact => "uniswap_price_impact",
    };

    Ok(Json(DeFiSkillResponse {
        success: true,
        skill: skill_name.to_string(),
        data: result,
        timestamp: chrono::Utc::now().timestamp() as u64,
    }))
}

/// Get supported chains
pub async fn get_supported_chains() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "chains": [
            {"id": "1", "name": "Ethereum", "symbol": "ETH"},
            {"id": "42161", "name": "Arbitrum", "symbol": "ARB"},
            {"id": "10", "name": "Optimism", "symbol": "OP"},
            {"id": "137", "name": "Polygon", "symbol": "MATIC"},
            {"id": "8453", "name": "Base", "symbol": "ETH"},
        ]
    }))
}

/// Get supported tokens
pub async fn get_supported_tokens() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "tokens": {
            "1": [
                {"symbol": "ETH", "address": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", "decimals": 18},
                {"symbol": "WETH", "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "decimals": 18},
                {"symbol": "USDC", "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "decimals": 6},
                {"symbol": "USDT", "address": "0xdAC17F958D2ee523a2206206994597C13D831ec7", "decimals": 6},
                {"symbol": "WBTC", "address": "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", "decimals": 8},
                {"symbol": "DAI", "address": "0x6B175474E89094C44Da98b954EesddFD691dCB", "decimals": 18},
            ]
        }
    }))
}
