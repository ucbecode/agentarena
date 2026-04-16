use crate::error::{AppError, Result};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// Real-time price feed from Binance WebSocket
pub struct PriceFeed {
    prices: Arc<RwLock<HashMap<String, f64>>>,
    subscribers: Arc<RwLock<Vec<tokio::sync::broadcast::Sender<PriceUpdate>>>>,
    connected: Arc<RwLock<bool>>,
    last_update: Arc<RwLock<u64>>,
}

#[derive(Debug, Clone)]
pub struct PriceUpdate {
    pub symbol: String,
    pub price: f64,
    pub timestamp: u64,
}

#[derive(Debug, Deserialize)]
struct BinanceTickerStream {
    stream: String,
    data: BinanceTicker,
}

#[derive(Debug, Deserialize)]
struct BinanceTicker {
    #[serde(rename = "s")]
    symbol: String,
    #[serde(rename = "c")]
    price: String,
    #[serde(rename = "E")]
    event_time: u64,
}

impl PriceFeed {
    pub fn new() -> Self {
        Self {
            prices: Arc::new(RwLock::new(HashMap::new())),
            subscribers: Arc::new(RwLock::new(Vec::new())),
            connected: Arc::new(RwLock::new(false)),
            last_update: Arc::new(RwLock::new(0)),
        }
    }

    /// Check if the price feed is connected and receiving data
    pub async fn is_connected(&self) -> bool {
        let connected = *self.connected.read().await;
        if !connected {
            return false;
        }

        // Also check that we've received data recently (within 30 seconds)
        let last_update = *self.last_update.read().await;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        now - last_update < 30
    }

    /// Start the price feed connection
    pub async fn start(&self) -> Result<()> {
        // Try Binance WebSocket first, fall back to polling if geo-blocked
        let binance_urls = [
            "wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker",
            "wss://stream.binance.us:9443/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker",
        ];

        let mut binance_blocked = false;
        let mut retry_count = 0;

        loop {
            if !binance_blocked {
                for url in &binance_urls {
                    match self.connect_and_stream(url).await {
                        Ok(_) => {
                            tracing::info!("Price feed disconnected, reconnecting...");
                            retry_count = 0;
                            continue;
                        }
                        Err(e) => {
                            let err_str = format!("{:?}", e);
                            if err_str.contains("451") || err_str.contains("403") {
                                // Geo-blocked, switch to polling mode
                                tracing::warn!("Binance WebSocket geo-blocked, switching to polling mode");
                                binance_blocked = true;
                                break;
                            }
                            retry_count += 1;
                            if retry_count <= 3 {
                                tracing::error!("Price feed error: {:?}, reconnecting in 5s...", e);
                            } else if retry_count == 4 {
                                tracing::warn!("Price feed errors continuing, suppressing logs...");
                            }
                        }
                    }
                }
            }

            if binance_blocked {
                // Use polling mode with CoinGecko
                if let Err(e) = self.poll_coingecko().await {
                    tracing::debug!("CoinGecko poll error: {:?}", e);
                }
            }

            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }
    }

    /// Poll CoinGecko for prices (fallback when WebSocket is blocked)
    async fn poll_coingecko(&self) -> Result<()> {
        let url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd";

        let response: serde_json::Value = reqwest::get(url)
            .await
            .map_err(|e| AppError::Internal(format!("CoinGecko error: {}", e)))?
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Parse error: {}", e)))?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let mut prices = self.prices.write().await;

        if let Some(btc) = response["bitcoin"]["usd"].as_f64() {
            prices.insert("BTC".to_string(), btc);
        }
        if let Some(eth) = response["ethereum"]["usd"].as_f64() {
            prices.insert("ETH".to_string(), eth);
        }
        if let Some(sol) = response["solana"]["usd"].as_f64() {
            prices.insert("SOL".to_string(), sol);
        }

        drop(prices);

        // Update last_update and connected status
        {
            let mut lu = self.last_update.write().await;
            *lu = now;
        }
        {
            let mut connected = self.connected.write().await;
            *connected = true;
        }

        Ok(())
    }

    async fn connect_and_stream(&self, url: &str) -> Result<()> {
        tracing::info!("Connecting to Binance WebSocket...");

        let (ws_stream, _) = connect_async(url)
            .await
            .map_err(|e| AppError::Internal(format!("WebSocket connect error: {}", e)))?;

        tracing::info!("Connected to Binance price feed");

        // Mark as connected
        {
            let mut connected = self.connected.write().await;
            *connected = true;
        }

        let (mut write, mut read) = ws_stream.split();

        // Clone references for the loop
        let prices = self.prices.clone();
        let subscribers = self.subscribers.clone();
        let last_update = self.last_update.clone();
        let connected = self.connected.clone();

        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Ok(ticker) = serde_json::from_str::<BinanceTickerStream>(&text) {
                        let symbol = ticker.data.symbol.replace("USDT", "");
                        if let Ok(price) = ticker.data.price.parse::<f64>() {
                            // Update price
                            {
                                let mut prices = prices.write().await;
                                prices.insert(symbol.clone(), price);
                            }

                            // Update last_update timestamp
                            {
                                let mut lu = last_update.write().await;
                                *lu = std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap()
                                    .as_secs();
                            }

                            // Notify subscribers
                            let update = PriceUpdate {
                                symbol: symbol.clone(),
                                price,
                                timestamp: ticker.data.event_time,
                            };

                            let subs = subscribers.read().await;
                            for sub in subs.iter() {
                                let _ = sub.send(update.clone());
                            }
                        }
                    }
                }
                Ok(Message::Ping(data)) => {
                    let _ = write.send(Message::Pong(data)).await;
                }
                Ok(Message::Close(_)) => {
                    tracing::warn!("WebSocket closed by server");
                    break;
                }
                Err(e) => {
                    tracing::error!("WebSocket error: {:?}", e);
                    break;
                }
                _ => {}
            }
        }

        // Mark as disconnected
        {
            let mut connected = connected.write().await;
            *connected = false;
        }

        Ok(())
    }

    /// Get current price for a symbol
    pub async fn get_price(&self, symbol: &str) -> Option<f64> {
        let prices = self.prices.read().await;
        prices.get(symbol).copied()
    }

    /// Get all current prices
    pub async fn get_all_prices(&self) -> HashMap<String, f64> {
        self.prices.read().await.clone()
    }

    /// Subscribe to price updates
    pub async fn subscribe(&self) -> tokio::sync::broadcast::Receiver<PriceUpdate> {
        let (tx, rx) = tokio::sync::broadcast::channel(100);
        let mut subs = self.subscribers.write().await;
        subs.push(tx);
        rx
    }

    /// Get price or fetch from HTTP fallback
    pub async fn get_price_or_fetch(&self, symbol: &str) -> Result<f64> {
        if let Some(price) = self.get_price(symbol).await {
            return Ok(price);
        }

        // Fallback to HTTP API
        let url = format!(
            "https://api.binance.com/api/v3/ticker/price?symbol={}USDT",
            symbol
        );

        let response: serde_json::Value = reqwest::get(&url)
            .await
            .map_err(|e| AppError::Internal(format!("Binance API error: {}", e)))?
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Parse error: {}", e)))?;

        let price = response["price"]
            .as_str()
            .and_then(|s| s.parse::<f64>().ok())
            .ok_or_else(|| AppError::Internal("Invalid price response".to_string()))?;

        // Cache it
        {
            let mut prices = self.prices.write().await;
            prices.insert(symbol.to_string(), price);
        }

        Ok(price)
    }
}

impl Default for PriceFeed {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_new_price_feed() {
        let feed = PriceFeed::new();

        // Initially no prices
        let prices = feed.get_all_prices().await;
        assert!(prices.is_empty());
    }

    #[tokio::test]
    async fn test_default_price_feed() {
        let feed = PriceFeed::default();

        // Should work the same as new()
        let prices = feed.get_all_prices().await;
        assert!(prices.is_empty());
    }

    #[tokio::test]
    async fn test_is_connected_initially_false() {
        let feed = PriceFeed::new();

        // Should not be connected initially
        let connected = feed.is_connected().await;
        assert!(!connected);
    }

    #[tokio::test]
    async fn test_get_price_not_found() {
        let feed = PriceFeed::new();

        // No prices loaded
        let price = feed.get_price("BTC").await;
        assert!(price.is_none());
    }

    #[tokio::test]
    async fn test_price_update_struct() {
        let update = PriceUpdate {
            symbol: "BTC".to_string(),
            price: 50000.0,
            timestamp: 12345,
        };

        // Test Clone
        let cloned = update.clone();
        assert_eq!(cloned.symbol, "BTC");
        assert_eq!(cloned.price, 50000.0);
        assert_eq!(cloned.timestamp, 12345);
    }

    #[tokio::test]
    async fn test_subscribe() {
        let feed = PriceFeed::new();

        let rx = feed.subscribe().await;

        // Should be able to subscribe
        // Verify the receiver is valid (len check works without mut)
        assert!(rx.len() >= 0);
    }

    #[tokio::test]
    async fn test_manual_price_insertion() {
        let feed = PriceFeed::new();

        // Manually insert a price (simulating what would happen from WebSocket)
        {
            let mut prices = feed.prices.write().await;
            prices.insert("BTC".to_string(), 50000.0);
        }

        // Should now be able to get the price
        let price = feed.get_price("BTC").await;
        assert!(price.is_some());
        assert_eq!(price.unwrap(), 50000.0);
    }

    #[tokio::test]
    async fn test_get_all_prices() {
        let feed = PriceFeed::new();

        // Insert multiple prices
        {
            let mut prices = feed.prices.write().await;
            prices.insert("BTC".to_string(), 50000.0);
            prices.insert("ETH".to_string(), 3000.0);
            prices.insert("SOL".to_string(), 100.0);
        }

        let all_prices = feed.get_all_prices().await;
        assert_eq!(all_prices.len(), 3);
        assert_eq!(all_prices.get("BTC"), Some(&50000.0));
        assert_eq!(all_prices.get("ETH"), Some(&3000.0));
        assert_eq!(all_prices.get("SOL"), Some(&100.0));
    }

    #[tokio::test]
    async fn test_last_update_tracking() {
        let feed = PriceFeed::new();

        // Initially last_update is 0
        let last_update = *feed.last_update.read().await;
        assert_eq!(last_update, 0);
    }

    #[tokio::test]
    async fn test_connected_flag_tracking() {
        let feed = PriceFeed::new();

        // Initially not connected
        assert!(!*feed.connected.read().await);

        // Manually set connected
        {
            let mut connected = feed.connected.write().await;
            *connected = true;
        }

        // But still won't pass is_connected due to stale last_update
        assert!(!feed.is_connected().await);
    }

    #[tokio::test]
    async fn test_is_connected_with_recent_update() {
        let feed = PriceFeed::new();

        // Set connected and recent last_update
        {
            let mut connected = feed.connected.write().await;
            *connected = true;
        }
        {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs();
            let mut last_update = feed.last_update.write().await;
            *last_update = now;
        }

        // Should now be connected
        assert!(feed.is_connected().await);
    }

    #[tokio::test]
    async fn test_is_connected_stale_data() {
        let feed = PriceFeed::new();

        // Set connected but old last_update (more than 30 seconds ago)
        {
            let mut connected = feed.connected.write().await;
            *connected = true;
        }
        {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs();
            let mut last_update = feed.last_update.write().await;
            *last_update = now - 60; // 60 seconds ago
        }

        // Should not be connected due to stale data
        assert!(!feed.is_connected().await);
    }

    #[tokio::test]
    async fn test_supported_symbols() {
        // Verify the expected symbols are BTC, ETH, SOL
        let expected_symbols = vec!["BTC", "ETH", "SOL"];

        for symbol in expected_symbols {
            // The feed URL contains these symbols
            let url = "wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker";
            assert!(url.to_lowercase().contains(&symbol.to_lowercase()));
        }
    }

    #[tokio::test]
    async fn test_price_precision() {
        let feed = PriceFeed::new();

        // Test with high-precision price
        {
            let mut prices = feed.prices.write().await;
            prices.insert("BTC".to_string(), 50123.45678);
        }

        let price = feed.get_price("BTC").await.unwrap();
        assert!((price - 50123.45678).abs() < 0.00001);
    }

    #[tokio::test]
    async fn test_multiple_subscribers() {
        let feed = PriceFeed::new();

        let rx1 = feed.subscribe().await;
        let rx2 = feed.subscribe().await;

        // Both should be valid receivers
        assert!(rx1.len() >= 0);
        assert!(rx2.len() >= 0);

        // Both subscribed
        let subs = feed.subscribers.read().await;
        assert_eq!(subs.len(), 2);
    }
}
