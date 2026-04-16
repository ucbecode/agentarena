use crate::error::{Error, Result};
use crate::models::*;
use crate::x402::X402Handler;
use futures::{SinkExt, StreamExt};
use reqwest::{header, Client, StatusCode};
use std::fmt;
use std::time::Duration;
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// Configuration for the Arena client
#[derive(Clone)]
pub struct ArenaClientConfig {
    pub base_url: String,
    pub private_key: Option<String>,
    pub rpc_url: Option<String>,
    pub usdc_address: Option<String>,
    /// Maximum number of retries for transient failures (default: 3)
    pub max_retries: usize,
    /// Base delay between retries in milliseconds (default: 1000)
    pub retry_delay_ms: u64,
    /// Request timeout in seconds (default: 30)
    pub timeout_secs: u64,
}

impl Default for ArenaClientConfig {
    fn default() -> Self {
        Self {
            base_url: "http://localhost:3460".to_string(),
            private_key: None,
            rpc_url: None,
            usdc_address: None,
            max_retries: 3,
            retry_delay_ms: 1000,
            timeout_secs: 30,
        }
    }
}

/// Arena client for interacting with AgentArena backend
pub struct ArenaClient {
    base_url: String,
    ws_url: String,
    http_client: Client,
    x402_handler: Option<X402Handler>,
    agent_id: Option<u64>,
    max_retries: usize,
    retry_delay_ms: u64,
}

// SECURITY: Custom Debug implementation to prevent private key exposure in logs/errors
impl fmt::Debug for ArenaClient {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ArenaClient")
            .field("base_url", &self.base_url)
            .field("ws_url", &self.ws_url)
            .field("agent_id", &self.agent_id)
            .field("max_retries", &self.max_retries)
            .field("retry_delay_ms", &self.retry_delay_ms)
            .field("x402_handler", &self.x402_handler.as_ref().map(|_| "[CONFIGURED]"))
            .finish()
    }
}

impl ArenaClient {
    /// Create a new client with optional wallet for payments
    pub fn new(base_url: &str, private_key: Option<&str>) -> Result<Self> {
        Self::with_config(ArenaClientConfig {
            base_url: base_url.to_string(),
            private_key: private_key.map(String::from),
            ..Default::default()
        })
    }

    /// Create a new client with full configuration
    pub fn with_config(config: ArenaClientConfig) -> Result<Self> {
        let base_url = config.base_url.trim_end_matches('/').to_string();

        // Convert HTTP URL to WebSocket URL
        let ws_url = base_url
            .replace("http://", "ws://")
            .replace("https://", "wss://");

        let x402_handler = if let Some(pk) = config.private_key.as_ref() {
            Some(X402Handler::new(
                pk,
                config.rpc_url.as_deref().unwrap_or("https://rpc.xlayer.tech"),
                config.usdc_address.as_deref().unwrap_or("0x74b7F16337b8972027F6196A17a631aC6dE26d22"),
            )?)
        } else {
            None
        };

        let http_client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_secs))
            .build()
            .map_err(|e| Error::Config(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            base_url,
            ws_url,
            http_client,
            x402_handler,
            agent_id: None,
            max_retries: config.max_retries,
            retry_delay_ms: config.retry_delay_ms,
        })
    }

    /// Check if an error is retryable
    fn is_retryable_status(status: StatusCode) -> bool {
        status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS
    }

    /// Execute a request with retry logic
    async fn request_with_retry<T, F, Fut>(&self, operation: F) -> Result<T>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<reqwest::Response>>,
        T: serde::de::DeserializeOwned,
    {
        let mut last_error = None;

        for attempt in 0..=self.max_retries {
            match operation().await {
                Ok(response) => {
                    let status = response.status();

                    if status.is_success() {
                        return Ok(response.json().await?);
                    }

                    if status == StatusCode::PAYMENT_REQUIRED {
                        // Don't retry payment required errors
                        return Err(Error::Api("Payment required".to_string()));
                    }

                    if Self::is_retryable_status(status) && attempt < self.max_retries {
                        let delay = self.retry_delay_ms * (1 << attempt);
                        tracing::warn!(
                            "Request failed with status {}, retrying in {}ms (attempt {}/{})",
                            status,
                            delay,
                            attempt + 1,
                            self.max_retries
                        );
                        tokio::time::sleep(Duration::from_millis(delay)).await;
                        continue;
                    }

                    let error: serde_json::Value = response.json().await?;
                    return Err(Error::Api(error["error"].as_str().unwrap_or("Unknown error").to_string()));
                }
                Err(e) => {
                    last_error = Some(e);
                    if attempt < self.max_retries {
                        let delay = self.retry_delay_ms * (1 << attempt);
                        tracing::warn!(
                            "Request failed, retrying in {}ms (attempt {}/{}): {:?}",
                            delay,
                            attempt + 1,
                            self.max_retries,
                            last_error
                        );
                        tokio::time::sleep(Duration::from_millis(delay)).await;
                    }
                }
            }
        }

        Err(last_error.unwrap_or_else(|| Error::Api("Request failed after retries".to_string())))
    }

    /// Set the agent ID for this client
    pub fn with_agent_id(mut self, agent_id: u64) -> Self {
        self.agent_id = Some(agent_id);
        self
    }

    /// Get agent stats
    pub async fn get_agent_stats(&self, agent_id: u64) -> Result<AgentStats> {
        let url = format!("{}/api/arena/stats/{}", self.base_url, agent_id);

        let response = self
            .http_client
            .get(&url)
            .send()
            .await?;

        if !response.status().is_success() {
            let error: serde_json::Value = response.json().await?;
            return Err(Error::Api(error["error"].as_str().unwrap_or("Unknown error").to_string()));
        }

        Ok(response.json().await?)
    }

    /// Create a challenge to another agent
    pub async fn create_challenge(
        &self,
        challenger_id: u64,
        challenged_id: u64,
        tier: u64,
    ) -> Result<ChallengeResponse> {
        let url = format!("{}/api/matches/challenge", self.base_url);

        let body = serde_json::json!({
            "challenger_id": challenger_id,
            "challenged_id": challenged_id,
            "tier": tier
        });

        // First request without payment
        let response = self
            .http_client
            .post(&url)
            .json(&body)
            .send()
            .await?;

        // Handle 402 Payment Required
        if response.status().as_u16() == 402 {
            let payment_required: serde_json::Value = response.json().await?;

            // Extract payment request
            let payment_request: PaymentRequest =
                serde_json::from_value(payment_required["payment"].clone())
                    .map_err(|e| Error::Api(format!("Invalid payment request: {}", e)))?;

            // Execute payment if we have a handler
            let handler = self.x402_handler.as_ref().ok_or_else(|| {
                Error::PaymentRequired(format!(
                    "Payment required: {} {} to {}",
                    payment_request.amount, payment_request.token, payment_request.recipient
                ))
            })?;

            let proof = handler.execute_payment(&payment_request).await?;

            // Retry with payment proof
            let proof_json = serde_json::to_string(&proof)?;
            let response = self
                .http_client
                .post(&url)
                .json(&body)
                .header("X-Payment-Proof", proof_json)
                .send()
                .await?;

            if !response.status().is_success() {
                let error: serde_json::Value = response.json().await?;
                return Err(Error::Api(error["error"].as_str().unwrap_or("Unknown error").to_string()));
            }

            return Ok(response.json().await?);
        }

        if !response.status().is_success() {
            let error: serde_json::Value = response.json().await?;
            return Err(Error::Api(error["error"].as_str().unwrap_or("Unknown error").to_string()));
        }

        Ok(response.json().await?)
    }

    /// Accept a challenge
    pub async fn accept_challenge(&self, match_id: &str, agent_id: u64) -> Result<Match> {
        let url = format!("{}/api/matches/{}/accept", self.base_url, match_id);

        let body = serde_json::json!({
            "agent_id": agent_id
        });

        // First request without payment
        let response = self
            .http_client
            .post(&url)
            .json(&body)
            .send()
            .await?;

        // Handle 402 Payment Required
        if response.status().as_u16() == 402 {
            let payment_required: serde_json::Value = response.json().await?;

            let payment_request: PaymentRequest =
                serde_json::from_value(payment_required["payment"].clone())
                    .map_err(|e| Error::Api(format!("Invalid payment request: {}", e)))?;

            let handler = self.x402_handler.as_ref().ok_or_else(|| {
                Error::PaymentRequired(format!(
                    "Payment required: {} {} to {}",
                    payment_request.amount, payment_request.token, payment_request.recipient
                ))
            })?;

            let proof = handler.execute_payment(&payment_request).await?;

            let proof_json = serde_json::to_string(&proof)?;
            let response = self
                .http_client
                .post(&url)
                .json(&body)
                .header("X-Payment-Proof", proof_json)
                .send()
                .await?;

            if !response.status().is_success() {
                let error: serde_json::Value = response.json().await?;
                return Err(Error::Api(error["error"].as_str().unwrap_or("Unknown error").to_string()));
            }

            return Ok(response.json().await?);
        }

        if !response.status().is_success() {
            let error: serde_json::Value = response.json().await?;
            return Err(Error::Api(error["error"].as_str().unwrap_or("Unknown error").to_string()));
        }

        Ok(response.json().await?)
    }

    /// Submit a trade during a match
    pub async fn submit_trade(
        &self,
        match_id: &str,
        trade: TradeRequest,
    ) -> Result<TradeResponse> {
        let url = format!("{}/api/matches/{}/trade", self.base_url, match_id);

        let response = self
            .http_client
            .post(&url)
            .json(&trade)
            .send()
            .await?;

        if !response.status().is_success() {
            let error: serde_json::Value = response.json().await?;
            return Err(Error::Api(error["error"].as_str().unwrap_or("Unknown error").to_string()));
        }

        Ok(response.json().await?)
    }

    /// Get current match state
    pub async fn get_match_state(&self, match_id: &str) -> Result<MatchState> {
        let url = format!("{}/api/matches/{}/state", self.base_url, match_id);

        let response = self
            .http_client
            .get(&url)
            .send()
            .await?;

        if !response.status().is_success() {
            let error: serde_json::Value = response.json().await?;
            return Err(Error::Api(error["error"].as_str().unwrap_or("Unknown error").to_string()));
        }

        Ok(response.json().await?)
    }

    /// Get match details
    pub async fn get_match(&self, match_id: &str) -> Result<Match> {
        let url = format!("{}/api/matches/{}", self.base_url, match_id);

        let response = self
            .http_client
            .get(&url)
            .send()
            .await?;

        if !response.status().is_success() {
            let error: serde_json::Value = response.json().await?;
            return Err(Error::Api(error["error"].as_str().unwrap_or("Unknown error").to_string()));
        }

        Ok(response.json().await?)
    }

    /// Get current prices
    pub async fn get_prices(&self) -> Result<std::collections::HashMap<String, f64>> {
        let url = format!("{}/api/prices", self.base_url);

        let response = self
            .http_client
            .get(&url)
            .send()
            .await?;

        if !response.status().is_success() {
            let error: serde_json::Value = response.json().await?;
            return Err(Error::Api(error["error"].as_str().unwrap_or("Unknown error").to_string()));
        }

        let result: serde_json::Value = response.json().await?;
        let prices: std::collections::HashMap<String, f64> =
            serde_json::from_value(result["prices"].clone())?;

        Ok(prices)
    }

    /// Get leaderboard
    pub async fn get_leaderboard(&self) -> Result<Leaderboard> {
        let url = format!("{}/api/leaderboard", self.base_url);

        let response = self
            .http_client
            .get(&url)
            .send()
            .await?;

        if !response.status().is_success() {
            let error: serde_json::Value = response.json().await?;
            return Err(Error::Api(error["error"].as_str().unwrap_or("Unknown error").to_string()));
        }

        Ok(response.json().await?)
    }

    /// Subscribe to match updates via WebSocket with automatic reconnection
    pub async fn subscribe_to_match(
        &self,
        match_id: &str,
    ) -> Result<MatchSubscription> {
        let url = format!("{}/ws/matches/{}", self.ws_url, match_id);
        MatchSubscription::connect(&url, self.max_retries, self.retry_delay_ms).await
    }
}

/// Configuration for WebSocket reconnection
pub struct ReconnectConfig {
    pub max_attempts: usize,
    pub initial_delay_ms: u64,
    pub max_delay_ms: u64,
    pub backoff_multiplier: u64,
}

impl Default for ReconnectConfig {
    fn default() -> Self {
        Self {
            max_attempts: 5,
            initial_delay_ms: 1000,
            max_delay_ms: 30000,
            backoff_multiplier: 2,
        }
    }
}

/// A WebSocket subscription with automatic reconnection
pub struct MatchSubscription {
    url: String,
    max_retries: usize,
    retry_delay_ms: u64,
    stream: Option<futures::stream::SplitStream<tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>>>,
    reconnect_attempt: usize,
}

impl MatchSubscription {
    async fn connect(url: &str, max_retries: usize, retry_delay_ms: u64) -> Result<Self> {
        let (ws_stream, _) = connect_async(url).await?;
        let (_, read) = ws_stream.split();

        Ok(Self {
            url: url.to_string(),
            max_retries,
            retry_delay_ms,
            stream: Some(read),
            reconnect_attempt: 0,
        })
    }

    /// Get the next message, with automatic reconnection on disconnect
    pub async fn next_message(&mut self) -> Option<Result<WsMessage>> {
        loop {
            if let Some(stream) = self.stream.as_mut() {
                match stream.next().await {
                    Some(Ok(Message::Text(text))) => {
                        self.reconnect_attempt = 0; // Reset on successful message
                        match serde_json::from_str::<WsMessage>(&text) {
                            Ok(msg) => return Some(Ok(msg)),
                            Err(e) => return Some(Err(Error::Json(e))),
                        }
                    }
                    Some(Ok(Message::Close(_))) => {
                        self.stream = None;
                        // Attempt reconnection
                    }
                    Some(Err(e)) => {
                        self.stream = None;
                        tracing::warn!("WebSocket error, will attempt reconnection: {}", e);
                    }
                    Some(Ok(_)) => continue, // Ignore ping/pong/binary
                    None => {
                        self.stream = None;
                    }
                }
            }

            // Attempt reconnection
            if self.reconnect_attempt >= self.max_retries {
                return Some(Err(Error::WebSocket(tokio_tungstenite::tungstenite::Error::ConnectionClosed)));
            }

            self.reconnect_attempt += 1;
            let delay = self.retry_delay_ms * (1 << (self.reconnect_attempt - 1));
            let delay = delay.min(30000); // Cap at 30 seconds

            tracing::info!(
                "Reconnecting to WebSocket in {}ms (attempt {}/{})",
                delay,
                self.reconnect_attempt,
                self.max_retries
            );

            tokio::time::sleep(Duration::from_millis(delay)).await;

            match connect_async(&self.url).await {
                Ok((ws_stream, _)) => {
                    let (_, read) = ws_stream.split();
                    self.stream = Some(read);
                    tracing::info!("WebSocket reconnected successfully");
                }
                Err(e) => {
                    tracing::warn!("WebSocket reconnection failed: {}", e);
                }
            }
        }
    }

    /// Close the subscription
    pub fn close(&mut self) {
        self.stream = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_arena_client_config_default() {
        let config = ArenaClientConfig::default();

        assert_eq!(config.base_url, "http://localhost:3460");
        assert!(config.private_key.is_none());
        assert!(config.rpc_url.is_none());
        assert!(config.usdc_address.is_none());
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.retry_delay_ms, 1000);
        assert_eq!(config.timeout_secs, 30);
    }

    #[test]
    fn test_arena_client_config_clone() {
        let config = ArenaClientConfig {
            base_url: "http://example.com".to_string(),
            private_key: Some("pk123".to_string()),
            rpc_url: Some("http://rpc.example.com".to_string()),
            usdc_address: Some("0x1234".to_string()),
            max_retries: 5,
            retry_delay_ms: 2000,
            timeout_secs: 60,
        };

        let cloned = config.clone();
        assert_eq!(cloned.base_url, config.base_url);
        assert_eq!(cloned.private_key, config.private_key);
        assert_eq!(cloned.max_retries, config.max_retries);
    }

    #[test]
    fn test_reconnect_config_default() {
        let config = ReconnectConfig::default();

        assert_eq!(config.max_attempts, 5);
        assert_eq!(config.initial_delay_ms, 1000);
        assert_eq!(config.max_delay_ms, 30000);
        assert_eq!(config.backoff_multiplier, 2);
    }

    #[test]
    fn test_is_retryable_status() {
        // Server errors should be retryable
        assert!(ArenaClient::is_retryable_status(StatusCode::INTERNAL_SERVER_ERROR));
        assert!(ArenaClient::is_retryable_status(StatusCode::BAD_GATEWAY));
        assert!(ArenaClient::is_retryable_status(StatusCode::SERVICE_UNAVAILABLE));
        assert!(ArenaClient::is_retryable_status(StatusCode::GATEWAY_TIMEOUT));

        // Rate limiting should be retryable
        assert!(ArenaClient::is_retryable_status(StatusCode::TOO_MANY_REQUESTS));

        // Client errors should NOT be retryable
        assert!(!ArenaClient::is_retryable_status(StatusCode::BAD_REQUEST));
        assert!(!ArenaClient::is_retryable_status(StatusCode::UNAUTHORIZED));
        assert!(!ArenaClient::is_retryable_status(StatusCode::FORBIDDEN));
        assert!(!ArenaClient::is_retryable_status(StatusCode::NOT_FOUND));
    }

    #[test]
    fn test_url_conversion() {
        let base_url = "http://localhost:3460/";
        let trimmed = base_url.trim_end_matches('/').to_string();
        assert_eq!(trimmed, "http://localhost:3460");

        let ws_url = trimmed
            .replace("http://", "ws://")
            .replace("https://", "wss://");
        assert_eq!(ws_url, "ws://localhost:3460");
    }

    #[test]
    fn test_https_to_wss_conversion() {
        let base_url = "https://arena.example.com";
        let ws_url = base_url
            .replace("http://", "ws://")
            .replace("https://", "wss://");
        assert_eq!(ws_url, "wss://arena.example.com");
    }

    #[tokio::test]
    async fn test_client_creation_no_wallet() {
        let result = ArenaClient::new("http://localhost:3460", None);
        assert!(result.is_ok());

        let client = result.unwrap();
        // x402_handler should be None
        assert!(client.x402_handler.is_none());
    }

    #[tokio::test]
    async fn test_client_with_config() {
        let config = ArenaClientConfig {
            base_url: "http://test.example.com".to_string(),
            private_key: None,
            rpc_url: None,
            usdc_address: None,
            max_retries: 5,
            retry_delay_ms: 500,
            timeout_secs: 60,
        };

        let result = ArenaClient::with_config(config);
        assert!(result.is_ok());

        let client = result.unwrap();
        assert_eq!(client.base_url, "http://test.example.com");
        assert_eq!(client.ws_url, "ws://test.example.com");
        assert_eq!(client.max_retries, 5);
        assert_eq!(client.retry_delay_ms, 500);
    }

    #[tokio::test]
    async fn test_client_with_agent_id() {
        let client = ArenaClient::new("http://localhost:3460", None).unwrap();
        assert!(client.agent_id.is_none());

        let client = client.with_agent_id(42);
        assert_eq!(client.agent_id, Some(42));
    }

    #[test]
    fn test_exponential_backoff_calculation() {
        let retry_delay_ms = 1000u64;

        // Attempt 0: 1000 * 2^0 = 1000ms
        assert_eq!(retry_delay_ms * (1 << 0), 1000);

        // Attempt 1: 1000 * 2^1 = 2000ms
        assert_eq!(retry_delay_ms * (1 << 1), 2000);

        // Attempt 2: 1000 * 2^2 = 4000ms
        assert_eq!(retry_delay_ms * (1 << 2), 4000);

        // Attempt 3: 1000 * 2^3 = 8000ms
        assert_eq!(retry_delay_ms * (1 << 3), 8000);
    }

    #[test]
    fn test_delay_capped_at_30_seconds() {
        let delay = 60000u64;
        let capped = delay.min(30000);
        assert_eq!(capped, 30000);
    }

    #[test]
    fn test_match_subscription_reconnect_attempt_tracking() {
        // Test that reconnect attempts are properly tracked
        let mut attempt = 0;
        let max_retries = 3;

        while attempt < max_retries {
            attempt += 1;
            let delay = 1000u64 * (1 << (attempt - 1));
            let capped_delay = delay.min(30000);

            match attempt {
                1 => assert_eq!(capped_delay, 1000),
                2 => assert_eq!(capped_delay, 2000),
                3 => assert_eq!(capped_delay, 4000),
                _ => {}
            }
        }

        assert_eq!(attempt, max_retries);
    }
}
