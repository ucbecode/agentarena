use crate::error::{Error, Result};
use crate::models::{PaymentProof, PaymentRequest};
use ethers::{
    prelude::*,
    types::{Address, TransactionRequest, U256},
};
use std::fmt;
use std::sync::Arc;

/// x402 Payment handler for automatic payment processing
pub struct X402Handler {
    wallet: LocalWallet,
    rpc_url: String,
    usdc_address: Address,
}

// SECURITY: Custom Debug implementation to prevent private key exposure in logs/errors
impl fmt::Debug for X402Handler {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("X402Handler")
            .field("address", &self.wallet.address())
            .field("rpc_url", &self.rpc_url)
            .field("usdc_address", &self.usdc_address)
            .field("wallet", &"[REDACTED]")
            .finish()
    }
}

// USDC ERC20 ABI for transfer
abigen!(
    USDC,
    r#"[
        function transfer(address to, uint256 amount) external returns (bool)
        function balanceOf(address account) external view returns (uint256)
        function approve(address spender, uint256 amount) external returns (bool)
    ]"#
);

impl X402Handler {
    /// Create a new x402 handler with a wallet
    pub fn new(private_key: &str, rpc_url: &str, usdc_address: &str) -> Result<Self> {
        let wallet: LocalWallet = private_key
            .parse()
            .map_err(|e| Error::Wallet(format!("Invalid private key: {}", e)))?;

        let usdc_address: Address = usdc_address
            .parse()
            .map_err(|e| Error::Config(format!("Invalid USDC address: {}", e)))?;

        Ok(Self {
            wallet: wallet.with_chain_id(196u64), // XLayer
            rpc_url: rpc_url.to_string(),
            usdc_address,
        })
    }

    /// Execute a payment and return proof
    pub async fn execute_payment(&self, request: &PaymentRequest) -> Result<PaymentProof> {
        let provider = Provider::<Http>::try_from(&self.rpc_url)
            .map_err(|e| Error::Config(format!("Provider error: {}", e)))?;

        let client = SignerMiddleware::new(provider, self.wallet.clone());
        let client = Arc::new(client);

        // Parse recipient
        let recipient: Address = request
            .recipient
            .parse()
            .map_err(|e| Error::Config(format!("Invalid recipient: {}", e)))?;

        // Create USDC contract instance
        let usdc = USDC::new(self.usdc_address, client.clone());

        // Check balance
        let balance = usdc
            .balance_of(self.wallet.address())
            .call()
            .await
            .map_err(|e| Error::Api(format!("Failed to get balance: {}", e)))?;

        if balance < U256::from(request.amount) {
            return Err(Error::Api(format!(
                "Insufficient USDC balance: have {}, need {}",
                balance, request.amount
            )));
        }

        // Execute transfer
        let transfer_call = usdc.transfer(recipient, U256::from(request.amount));
        let tx = transfer_call
            .send()
            .await
            .map_err(|e| Error::Api(format!("Transfer failed: {}", e)))?;

        // Wait for confirmation
        let receipt = tx
            .await
            .map_err(|e| Error::Api(format!("Transaction failed: {}", e)))?;

        let tx_hash = receipt
            .map(|r| format!("{:?}", r.transaction_hash))
            .ok_or_else(|| Error::Api("No transaction receipt".to_string()))?;

        Ok(PaymentProof {
            nonce: request.nonce.clone(),
            tx_hash,
        })
    }

    /// Get USDC balance
    pub async fn get_balance(&self) -> Result<u64> {
        let provider = Provider::<Http>::try_from(&self.rpc_url)
            .map_err(|e| Error::Config(format!("Provider error: {}", e)))?;

        let client = SignerMiddleware::new(provider, self.wallet.clone());
        let client = Arc::new(client);

        let usdc = USDC::new(self.usdc_address, client);

        let balance = usdc
            .balance_of(self.wallet.address())
            .call()
            .await
            .map_err(|e| Error::Api(format!("Failed to get balance: {}", e)))?;

        // Convert to u64 (USDC has 6 decimals)
        Ok(balance.as_u64())
    }

    /// Get wallet address
    pub fn address(&self) -> Address {
        self.wallet.address()
    }
}

/// Helper to create a dev mode payment proof (for testing)
pub fn create_dev_payment_proof(nonce: &str) -> PaymentProof {
    PaymentProof {
        nonce: nonce.to_string(),
        tx_hash: format!("DEV_PAYMENT_{}", uuid::Uuid::new_v4()),
    }
}
