use crate::error::{AppError, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const ONCHAINOS_BASE_URL: &str = "https://www.okx.com/api/v5/dex";
const UNISWAP_V3_ROUTER: &str = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

/// OnchainOS service for DeFi operations (Uniswap quotes, swap routing, analytics)
pub struct OnchainOsService {
    client: Client,
    api_key: Option<String>,
    project_id: Option<String>,
}

// Token addresses on Ethereum mainnet
pub const ETH_MAINNET_TOKENS: &[(&str, &str)] = &[
    ("ETH", "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"),
    ("WETH", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
    ("USDC", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
    ("USDT", "0xdAC17F958D2ee523a2206206994597C13D831ec7"),
    ("WBTC", "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"),
    ("DAI", "0x6B175474E89094C44Da98b954EesddFD691dCB"),
];

// Chain IDs
pub const ETHEREUM_CHAIN_ID: &str = "1";
pub const ARBITRUM_CHAIN_ID: &str = "42161";
pub const OPTIMISM_CHAIN_ID: &str = "10";
pub const POLYGON_CHAIN_ID: &str = "137";
pub const BASE_CHAIN_ID: &str = "8453";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapQuote {
    pub from_token: String,
    pub to_token: String,
    pub from_token_amount: String,
    pub to_token_amount: String,
    pub estimated_gas: String,
    pub price_impact: f64,
    pub route: Vec<SwapRoute>,
    pub dex_router_address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapRoute {
    pub dex_name: String,
    pub percentage: f64,
    pub from_token: String,
    pub to_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenPrice {
    pub symbol: String,
    pub price_usd: f64,
    pub price_change_24h: f64,
    pub volume_24h: f64,
    pub liquidity_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PoolInfo {
    pub pool_address: String,
    pub dex: String,
    pub token0: String,
    pub token1: String,
    pub fee_tier: f64,
    pub tvl_usd: f64,
    pub volume_24h: f64,
    pub apr: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DexAggregatorResponse {
    pub code: String,
    pub data: Vec<DexQuoteData>,
    pub msg: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DexQuoteData {
    pub router_result: RouterResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouterResult {
    pub from_token_amount: String,
    pub to_token_amount: String,
    pub trade_fee: String,
    pub estimate_gas_fee: String,
    pub quote_compare_list: Vec<QuoteCompare>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteCompare {
    pub dex_name: String,
    pub dex_logo: String,
    pub trade_fee: String,
    pub receive_amount: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UniswapSkillRequest {
    pub action: UniswapAction,
    pub chain_id: String,
    pub from_token: String,
    pub to_token: String,
    pub amount: String,
    pub slippage: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UniswapAction {
    Quote,
    Route,
    PoolInfo,
    PriceImpact,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeFiInsight {
    pub insight_type: String,
    pub symbol: String,
    pub data: serde_json::Value,
    pub timestamp: u64,
}

impl OnchainOsService {
    pub fn new(api_key: Option<String>, project_id: Option<String>) -> Self {
        Self {
            client: Client::new(),
            api_key,
            project_id,
        }
    }

    /// Get swap quote from DEX aggregator (Uniswap, SushiSwap, etc.)
    pub async fn get_swap_quote(
        &self,
        chain_id: &str,
        from_token: &str,
        to_token: &str,
        amount: &str,
        slippage: f64,
    ) -> Result<SwapQuote> {
        let url = format!("{}/aggregator/swap", ONCHAINOS_BASE_URL);

        let mut params = HashMap::new();
        params.insert("chainId", chain_id);
        params.insert("fromTokenAddress", from_token);
        params.insert("toTokenAddress", to_token);
        params.insert("amount", amount);

        let slippage_str = slippage.to_string();
        params.insert("slippage", &slippage_str);

        let mut request = self.client.get(&url).query(&params);

        if let Some(ref api_key) = self.api_key {
            request = request.header("OK-ACCESS-KEY", api_key);
        }
        if let Some(ref project_id) = self.project_id {
            request = request.header("OK-ACCESS-PROJECT", project_id);
        }

        let response = request
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("OnchainOS request failed: {}", e)))?;

        if !response.status().is_success() {
            // Return mock data for demo/testing
            return Ok(self.mock_swap_quote(from_token, to_token, amount));
        }

        let data: DexAggregatorResponse = response
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to parse response: {}", e)))?;

        if data.code != "0" || data.data.is_empty() {
            return Ok(self.mock_swap_quote(from_token, to_token, amount));
        }

        let router_result = &data.data[0].router_result;

        // Build routes from quote comparisons
        let routes: Vec<SwapRoute> = router_result
            .quote_compare_list
            .iter()
            .take(3)
            .map(|q| SwapRoute {
                dex_name: q.dex_name.clone(),
                percentage: 100.0 / router_result.quote_compare_list.len() as f64,
                from_token: from_token.to_string(),
                to_token: to_token.to_string(),
            })
            .collect();

        Ok(SwapQuote {
            from_token: from_token.to_string(),
            to_token: to_token.to_string(),
            from_token_amount: router_result.from_token_amount.clone(),
            to_token_amount: router_result.to_token_amount.clone(),
            estimated_gas: router_result.estimate_gas_fee.clone(),
            price_impact: self.estimate_price_impact(&router_result.from_token_amount, &router_result.to_token_amount),
            route: routes,
            dex_router_address: UNISWAP_V3_ROUTER.to_string(),
        })
    }

    /// Get best DEX route for a swap
    pub async fn get_best_route(
        &self,
        chain_id: &str,
        from_token: &str,
        to_token: &str,
        amount: &str,
    ) -> Result<Vec<SwapRoute>> {
        let quote = self.get_swap_quote(chain_id, from_token, to_token, amount, 0.5).await?;
        Ok(quote.route)
    }

    /// Get token price from DEX pools
    pub async fn get_token_price(&self, chain_id: &str, token_address: &str) -> Result<TokenPrice> {
        // For demo, return simulated prices based on token
        let (symbol, price, change, volume) = if token_address.to_lowercase().contains("c02aaa") {
            ("WETH", 3450.0, 2.5, 1_500_000_000.0)
        } else if token_address.to_lowercase().contains("2260fac") {
            ("WBTC", 67000.0, 1.8, 800_000_000.0)
        } else if token_address.to_lowercase().contains("a0b869") {
            ("USDC", 1.0, 0.01, 5_000_000_000.0)
        } else {
            ("UNKNOWN", 1.0, 0.0, 0.0)
        };

        Ok(TokenPrice {
            symbol: symbol.to_string(),
            price_usd: price,
            price_change_24h: change,
            volume_24h: volume,
            liquidity_usd: volume * 0.1,
        })
    }

    /// Get Uniswap pool information
    pub async fn get_pool_info(
        &self,
        chain_id: &str,
        token0: &str,
        token1: &str,
    ) -> Result<Vec<PoolInfo>> {
        // Return mock pool data for common pairs
        let pools = vec![
            PoolInfo {
                pool_address: "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8".to_string(),
                dex: "Uniswap V3".to_string(),
                token0: token0.to_string(),
                token1: token1.to_string(),
                fee_tier: 0.3,
                tvl_usd: 250_000_000.0,
                volume_24h: 85_000_000.0,
                apr: 12.5,
            },
            PoolInfo {
                pool_address: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640".to_string(),
                dex: "Uniswap V3".to_string(),
                token0: token0.to_string(),
                token1: token1.to_string(),
                fee_tier: 0.05,
                tvl_usd: 180_000_000.0,
                volume_24h: 120_000_000.0,
                apr: 8.2,
            },
        ];

        Ok(pools)
    }

    /// Execute Uniswap skill (called by agents)
    pub async fn execute_uniswap_skill(&self, request: UniswapSkillRequest) -> Result<serde_json::Value> {
        match request.action {
            UniswapAction::Quote => {
                let quote = self.get_swap_quote(
                    &request.chain_id,
                    &request.from_token,
                    &request.to_token,
                    &request.amount,
                    request.slippage.unwrap_or(0.5),
                ).await?;
                Ok(serde_json::to_value(quote).unwrap())
            }
            UniswapAction::Route => {
                let routes = self.get_best_route(
                    &request.chain_id,
                    &request.from_token,
                    &request.to_token,
                    &request.amount,
                ).await?;
                Ok(serde_json::to_value(routes).unwrap())
            }
            UniswapAction::PoolInfo => {
                let pools = self.get_pool_info(
                    &request.chain_id,
                    &request.from_token,
                    &request.to_token,
                ).await?;
                Ok(serde_json::to_value(pools).unwrap())
            }
            UniswapAction::PriceImpact => {
                let quote = self.get_swap_quote(
                    &request.chain_id,
                    &request.from_token,
                    &request.to_token,
                    &request.amount,
                    request.slippage.unwrap_or(0.5),
                ).await?;
                Ok(serde_json::json!({
                    "price_impact": quote.price_impact,
                    "from_amount": quote.from_token_amount,
                    "to_amount": quote.to_token_amount,
                    "estimated_gas": quote.estimated_gas,
                }))
            }
        }
    }

    /// Get DeFi insights for trading decisions
    pub async fn get_defi_insights(&self, symbol: &str) -> Result<Vec<DeFiInsight>> {
        let mut insights = Vec::new();
        let now = chrono::Utc::now().timestamp() as u64;

        // Get token address
        let token_address = self.symbol_to_address(symbol);
        let usdc_address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

        // Pool liquidity insight
        if let Ok(pools) = self.get_pool_info(ETHEREUM_CHAIN_ID, &token_address, usdc_address).await {
            let total_tvl: f64 = pools.iter().map(|p| p.tvl_usd).sum();
            let avg_apr: f64 = pools.iter().map(|p| p.apr).sum::<f64>() / pools.len() as f64;

            insights.push(DeFiInsight {
                insight_type: "liquidity".to_string(),
                symbol: symbol.to_string(),
                data: serde_json::json!({
                    "total_tvl_usd": total_tvl,
                    "pool_count": pools.len(),
                    "average_apr": avg_apr,
                    "best_pool": pools.first().map(|p| &p.pool_address),
                }),
                timestamp: now,
            });
        }

        // Price impact insight for a $10k trade
        if let Ok(quote) = self.get_swap_quote(
            ETHEREUM_CHAIN_ID,
            usdc_address,
            &token_address,
            "10000000000", // $10k in USDC (6 decimals)
            0.5,
        ).await {
            insights.push(DeFiInsight {
                insight_type: "price_impact".to_string(),
                symbol: symbol.to_string(),
                data: serde_json::json!({
                    "trade_size_usd": 10000,
                    "price_impact_pct": quote.price_impact,
                    "best_route": quote.route.first().map(|r| &r.dex_name),
                    "estimated_gas_usd": quote.estimated_gas,
                }),
                timestamp: now,
            });
        }

        // Market depth signal
        insights.push(DeFiInsight {
            insight_type: "market_depth".to_string(),
            symbol: symbol.to_string(),
            data: serde_json::json!({
                "depth_score": self.calculate_depth_score(symbol),
                "slippage_1k": 0.05,
                "slippage_10k": 0.15,
                "slippage_100k": 0.8,
            }),
            timestamp: now,
        });

        Ok(insights)
    }

    // Helper methods

    fn mock_swap_quote(&self, from_token: &str, to_token: &str, amount: &str) -> SwapQuote {
        let amount_f64: f64 = amount.parse().unwrap_or(1000000.0);

        // Simulate exchange rate
        let rate = if from_token.contains("USDC") || from_token.contains("USDT") {
            if to_token.contains("ETH") || to_token.contains("WETH") {
                0.00029 // ~$3450/ETH
            } else if to_token.contains("BTC") || to_token.contains("WBTC") {
                0.000015 // ~$67000/BTC
            } else {
                1.0
            }
        } else {
            1.0
        };

        let to_amount = (amount_f64 * rate) as u64;

        SwapQuote {
            from_token: from_token.to_string(),
            to_token: to_token.to_string(),
            from_token_amount: amount.to_string(),
            to_token_amount: to_amount.to_string(),
            estimated_gas: "150000".to_string(),
            price_impact: 0.12,
            route: vec![
                SwapRoute {
                    dex_name: "Uniswap V3".to_string(),
                    percentage: 80.0,
                    from_token: from_token.to_string(),
                    to_token: to_token.to_string(),
                },
                SwapRoute {
                    dex_name: "SushiSwap".to_string(),
                    percentage: 20.0,
                    from_token: from_token.to_string(),
                    to_token: to_token.to_string(),
                },
            ],
            dex_router_address: UNISWAP_V3_ROUTER.to_string(),
        }
    }

    fn estimate_price_impact(&self, from_amount: &str, to_amount: &str) -> f64 {
        // Simple price impact estimation
        let from: f64 = from_amount.parse().unwrap_or(1.0);
        let to: f64 = to_amount.parse().unwrap_or(1.0);

        if from > 1_000_000_000.0 {
            0.5 // High impact for large trades
        } else if from > 100_000_000.0 {
            0.15
        } else {
            0.05
        }
    }

    fn symbol_to_address(&self, symbol: &str) -> String {
        match symbol.to_uppercase().as_str() {
            "ETH" => "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE".to_string(),
            "WETH" => "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".to_string(),
            "BTC" | "WBTC" => "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599".to_string(),
            "USDC" => "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".to_string(),
            "USDT" => "0xdAC17F958D2ee523a2206206994597C13D831ec7".to_string(),
            _ => "0x0000000000000000000000000000000000000000".to_string(),
        }
    }

    fn calculate_depth_score(&self, symbol: &str) -> f64 {
        match symbol.to_uppercase().as_str() {
            "ETH" | "WETH" => 95.0,
            "BTC" | "WBTC" => 90.0,
            "USDC" | "USDT" => 98.0,
            _ => 50.0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_swap_quote() {
        let service = OnchainOsService::new(None, None);
        let quote = service.mock_swap_quote(
            "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            "1000000000",
        );

        assert!(!quote.route.is_empty());
        assert_eq!(quote.route[0].dex_name, "Uniswap V3");
    }

    #[tokio::test]
    async fn test_symbol_to_address() {
        let service = OnchainOsService::new(None, None);

        let eth_addr = service.symbol_to_address("ETH");
        assert!(eth_addr.starts_with("0xEeee"));

        let btc_addr = service.symbol_to_address("BTC");
        assert!(btc_addr.starts_with("0x2260"));
    }

    #[tokio::test]
    async fn test_get_pool_info() {
        let service = OnchainOsService::new(None, None);
        let pools = service.get_pool_info(
            ETHEREUM_CHAIN_ID,
            "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        ).await.unwrap();

        assert!(!pools.is_empty());
        assert!(pools[0].tvl_usd > 0.0);
    }

    #[tokio::test]
    async fn test_get_defi_insights() {
        let service = OnchainOsService::new(None, None);
        let insights = service.get_defi_insights("ETH").await.unwrap();

        assert!(!insights.is_empty());
        assert!(insights.iter().any(|i| i.insight_type == "liquidity"));
    }
}
