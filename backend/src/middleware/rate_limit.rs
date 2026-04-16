use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::Response,
    Json,
};
use serde_json::json;
use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// Simple sliding window rate limiter
#[derive(Clone)]
pub struct RateLimiter {
    /// IP -> (request count, window start)
    requests: Arc<RwLock<HashMap<IpAddr, (u32, Instant)>>>,
    /// Max requests per window
    max_requests: u32,
    /// Window duration
    window: Duration,
}

impl RateLimiter {
    pub fn new(max_requests: u32, window_secs: u64) -> Self {
        Self {
            requests: Arc::new(RwLock::new(HashMap::new())),
            max_requests,
            window: Duration::from_secs(window_secs),
        }
    }

    pub async fn check(&self, ip: IpAddr) -> bool {
        let mut requests = self.requests.write().await;
        let now = Instant::now();

        let entry = requests.entry(ip).or_insert((0, now));

        // Reset window if expired
        if now.duration_since(entry.1) > self.window {
            entry.0 = 0;
            entry.1 = now;
        }

        entry.0 += 1;
        entry.0 <= self.max_requests
    }

    /// Clean up old entries periodically
    pub async fn cleanup(&self) {
        let mut requests = self.requests.write().await;
        let now = Instant::now();
        requests.retain(|_, (_, start)| now.duration_since(*start) < self.window * 2);
    }
}

/// Rate limiting middleware
pub async fn rate_limit(
    request: Request,
    next: Next,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    // Extract IP from headers or connection
    let ip = request.headers()
        .get("X-Forwarded-For")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .and_then(|s| s.trim().parse::<IpAddr>().ok())
        .unwrap_or_else(|| "127.0.0.1".parse().unwrap());

    // Get rate limiter from request extensions (set by app state)
    // For now, we'll use a simple per-request check
    // In production, this would be injected via state

    // Simple in-memory rate limit: 100 requests per minute
    static LIMITER: std::sync::OnceLock<RateLimiter> = std::sync::OnceLock::new();
    let limiter = LIMITER.get_or_init(|| RateLimiter::new(100, 60));

    if !limiter.check(ip).await {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({
                "error": "Rate limit exceeded",
                "retry_after_secs": 60
            })),
        ));
    }

    Ok(next.run(request).await)
}
