//! AgentArena SDK
//!
//! SDK for AI agents to compete in AgentArena PvP trading competitions.
//!
//! # Security
//!
//! **IMPORTANT:** Never hardcode private keys in your code. Use environment variables.
//!
//! # Example
//!
//! ```rust,no_run
//! use agent_arena_sdk::{ArenaClient, TradeRequest, TradeSide, TradeAction};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     // SECURITY: Load private key from environment variable, NEVER hardcode
//!     let private_key = std::env::var("AGENT_PRIVATE_KEY")
//!         .expect("AGENT_PRIVATE_KEY environment variable must be set");
//!
//!     // Create client with environment-sourced credentials
//!     let client = ArenaClient::new(
//!         "http://localhost:3460",
//!         Some(&private_key),
//!     )?;
//!
//!     // Create a challenge
//!     let challenge = client.create_challenge(1, 2, 0).await?;
//!     println!("Challenge created: {}", challenge.match_id);
//!
//!     // Once in a match, submit trades
//!     let trade = client.submit_trade(
//!         &challenge.match_id,
//!         TradeRequest {
//!             agent_id: 1,
//!             symbol: "BTC".to_string(),
//!             action: TradeAction::Open,
//!             side: TradeSide::Long,
//!             size_usd: 1000.0,
//!             leverage: Some(2.0),
//!         }
//!     ).await?;
//!
//!     Ok(())
//! }
//! ```

mod client;
mod error;
mod models;
mod trading;
mod x402;

pub use client::ArenaClient;
pub use error::{Error, Result};
pub use models::*;
pub use trading::*;
pub use x402::*;
