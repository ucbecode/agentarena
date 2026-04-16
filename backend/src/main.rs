use axum::{
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::{net::SocketAddr, sync::Arc};
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod error;
mod middleware;
mod models;
mod routes;
mod services;

// Import our middleware module as mw
use crate::middleware as mw;

use services::{
    match_service::MatchService,
    onchainos_service::OnchainOsService,
    oracle_service::OracleService,
    price_feed::PriceFeed,
    trade_engine::TradeEngine,
    x402_service::X402Service,
};

#[derive(Clone)]
pub struct AppState {
    pub match_service: Arc<MatchService>,
    pub trade_engine: Arc<TradeEngine>,
    pub price_feed: Arc<PriceFeed>,
    pub x402_service: Arc<X402Service>,
    pub oracle_service: Arc<OracleService>,
    pub onchainos_service: Arc<OnchainOsService>,
}

/// Root endpoint - API information
async fn api_info() -> Json<Value> {
    Json(json!({
        "name": "AgentArena API",
        "version": env!("CARGO_PKG_VERSION"),
        "description": "PvP Trading Competition Platform for AI Agents",
        "endpoints": {
            "health": "/health",
            "prices": "/api/prices",
            "leaderboard": "/api/leaderboard",
            "matches": "/api/matches",
            "demo": "/api/demo/create-match"
        },
        "docs": "https://github.com/sandeepgehlawat/agent-arena"
    }))
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            "agent_arena_backend=debug,tower_http=debug".into()
        }))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    let rpc_url = std::env::var("XLAYER_RPC").unwrap_or_else(|_| "https://rpc.xlayer.tech".to_string());
    let usdc_address = std::env::var("USDC_ADDRESS")
        .unwrap_or_else(|_| "0x74b7F16337b8972027F6196A17a631aC6dE26d22".to_string());
    let platform_wallet = std::env::var("PLATFORM_WALLET").unwrap_or_default();

    // Initialize services
    let price_feed = Arc::new(PriceFeed::new());
    let trade_engine = Arc::new(TradeEngine::new(price_feed.clone()));
    let match_service = Arc::new(MatchService::new(trade_engine.clone()));
    let oracle_service = Arc::new(OracleService::new(
        rpc_url.clone(),
        std::env::var("MATCH_MANAGER").ok(),
        std::env::var("ORACLE_PRIVATE_KEY").ok(),
    ));

    let x402_service = Arc::new(X402Service::new(
        std::env::var("OKX_API_KEY").unwrap_or_default(),
        std::env::var("OKX_API_SECRET").unwrap_or_default(),
        std::env::var("OKX_PASSPHRASE").unwrap_or_default(),
        rpc_url,
        usdc_address,
        platform_wallet,
    ));

    let onchainos_service = Arc::new(OnchainOsService::new(
        std::env::var("OKX_API_KEY").ok(),
        std::env::var("OKX_PROJECT_ID").ok(),
    ));

    let state = AppState {
        match_service,
        trade_engine,
        price_feed: price_feed.clone(),
        x402_service,
        oracle_service,
        onchainos_service,
    };

    // Start price feed
    let pf = price_feed.clone();
    tokio::spawn(async move {
        if let Err(e) = pf.start().await {
            tracing::error!("Price feed error: {:?}", e);
        }
    });

    // Configure CORS properly for production
    let allowed_origins = std::env::var("ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:3461".to_string());

    let cors = if allowed_origins == "*" {
        CorsLayer::permissive()
    } else {
        let origins: Vec<_> = allowed_origins
            .split(',')
            .filter_map(|s| s.trim().parse().ok())
            .collect();

        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods(Any)
            .allow_headers(Any)
    };

    // Build router with middleware
    let app = Router::new()
        // Root - API info
        .route("/", get(api_info))
        // Health checks (no auth required)
        .route("/health", get(routes::health::health_check))
        .route("/health/ready", get(routes::health::readiness_check))
        .route("/health/live", get(routes::health::liveness_check))
        // Prices (no auth required)
        .route("/api/prices", get(routes::prices::get_prices))
        // Leaderboard (no auth required)
        .route("/api/leaderboard", get(routes::leaderboard::get_leaderboard))
        .route("/api/leaderboard/season", get(routes::leaderboard::get_season_leaderboard))
        // DeFi skills / OnchainOS (no auth required - informational)
        .route("/api/defi/quote", get(routes::defi::get_swap_quote))
        .route("/api/defi/route", get(routes::defi::get_swap_route))
        .route("/api/defi/pools", get(routes::defi::get_pools))
        .route("/api/defi/insights/:symbol", get(routes::defi::get_defi_insights))
        .route("/api/defi/skill", post(routes::defi::execute_uniswap_skill))
        .route("/api/defi/chains", get(routes::defi::get_supported_chains))
        .route("/api/defi/tokens", get(routes::defi::get_supported_tokens))
        // Public match info (no auth required)
        .route("/api/matches", get(routes::matches::list_matches))
        .route("/api/matches/stats", get(routes::matches::get_stats))
        .route("/api/matches/:match_id", get(routes::matches::get_match))
        .route("/api/matches/:match_id/state", get(routes::matches::get_match_state))
        .route("/api/matches/:match_id/trades", get(routes::matches::get_trade_history))
        // WebSocket for live match updates
        .route("/ws/matches/:match_id", get(routes::ws::match_websocket))
        // Demo routes (no auth - for testing only)
        .route("/api/demo/create-match", post(routes::demo::create_demo_match))
        .route("/api/demo/end-match", post(routes::demo::end_demo_match))
        .route("/api/demo/onchain-match", post(routes::demo::create_onchain_match))
        .route("/api/demo/matches", get(routes::demo::list_demo_matches))
        // Protected routes (require signature)
        .nest("/api", Router::new()
            .route("/arena/register", post(routes::arena::register_for_arena))
            .route("/arena/stats/:agent_id", get(routes::arena::get_stats))
            .route("/matches/challenge", post(routes::matches::create_challenge))
            .route("/matches/:match_id/accept", post(routes::matches::accept_challenge))
            .route("/matches/:match_id/trade", post(routes::matches::submit_trade))
            .layer(axum::middleware::from_fn(mw::verify_signature))
        )
        .with_state(state)
        .layer(axum::middleware::from_fn(mw::rate_limit))
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    // Start server
    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "3460".to_string())
        .parse()
        .unwrap_or(3460);

    let addr = format!("{}:{}", host, port).parse::<SocketAddr>().unwrap();
    tracing::info!("AgentArena backend listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();

    // Graceful shutdown handling
    let shutdown_signal = async {
        let ctrl_c = async {
            tokio::signal::ctrl_c()
                .await
                .expect("Failed to install Ctrl+C handler");
        };

        #[cfg(unix)]
        let terminate = async {
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("Failed to install signal handler")
                .recv()
                .await;
        };

        #[cfg(not(unix))]
        let terminate = std::future::pending::<()>();

        tokio::select! {
            _ = ctrl_c => {},
            _ = terminate => {},
        }

        tracing::info!("Shutdown signal received, starting graceful shutdown...");
    };

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal)
        .await
        .unwrap();

    tracing::info!("Server shut down gracefully");
}
