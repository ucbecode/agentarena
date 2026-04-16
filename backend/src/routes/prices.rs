use axum::{extract::State, Json};
use serde::Serialize;
use std::collections::HashMap;

use crate::error::Result;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct PricesResponse {
    pub prices: HashMap<String, f64>,
    pub timestamp: u64,
}

/// Get current prices for all supported assets
pub async fn get_prices(State(state): State<AppState>) -> Result<Json<PricesResponse>> {
    let prices = state.price_feed.get_all_prices().await;
    let timestamp = chrono::Utc::now().timestamp() as u64;

    Ok(Json(PricesResponse { prices, timestamp }))
}
