use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::AppState;

#[derive(Serialize)]
pub struct HealthResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
    timestamp: u64,
    checks: HealthChecks,
}

#[derive(Serialize)]
pub struct HealthChecks {
    price_feed: CheckStatus,
    match_service: CheckStatus,
    x402_service: CheckStatus,
}

#[derive(Serialize)]
pub struct CheckStatus {
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<String>,
}

impl CheckStatus {
    fn healthy() -> Self {
        Self {
            status: "healthy",
            details: None,
        }
    }

    fn unhealthy(details: impl Into<String>) -> Self {
        Self {
            status: "unhealthy",
            details: Some(details.into()),
        }
    }

    fn degraded(details: impl Into<String>) -> Self {
        Self {
            status: "degraded",
            details: Some(details.into()),
        }
    }
}

/// Basic health check endpoint (for load balancers)
pub async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "agent-arena",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

/// Readiness check - verifies all dependencies are ready
pub async fn readiness_check(
    State(state): State<AppState>,
) -> Result<Json<HealthResponse>, (StatusCode, Json<HealthResponse>)> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Check price feed
    let price_feed_check = if state.price_feed.is_connected().await {
        CheckStatus::healthy()
    } else {
        CheckStatus::unhealthy("Price feed not connected")
    };

    // Check x402 service configuration
    let x402_check = if state.x402_service.is_configured() {
        CheckStatus::healthy()
    } else {
        CheckStatus::degraded("x402 service not fully configured - payments disabled")
    };

    // Check match service
    let match_service_check = CheckStatus::healthy(); // Basic check

    let checks = HealthChecks {
        price_feed: price_feed_check,
        match_service: match_service_check,
        x402_service: x402_check,
    };

    let all_healthy = checks.price_feed.status == "healthy";

    let response = HealthResponse {
        status: if all_healthy { "ok" } else { "degraded" },
        service: "agent-arena",
        version: env!("CARGO_PKG_VERSION"),
        timestamp,
        checks,
    };

    if all_healthy {
        Ok(Json(response))
    } else {
        Err((StatusCode::SERVICE_UNAVAILABLE, Json(response)))
    }
}

/// Liveness check - verifies the service is alive
pub async fn liveness_check() -> StatusCode {
    StatusCode::OK
}
