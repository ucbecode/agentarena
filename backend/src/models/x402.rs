use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct X402PaymentRequest {
    pub network: String,
    pub token: String,
    pub amount: u64,
    pub recipient: String,
    pub nonce: String,
    pub expires: u64,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct X402PaymentProof {
    pub nonce: String,
    pub tx_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct X402VerificationResult {
    pub valid: bool,
    pub amount_paid: u64,
    pub recipient: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentNonce {
    pub nonce: String,
    pub recipient: String,
    pub amount: u64,
    pub expires: u64,
    pub used: bool,
    pub created_at: u64,
    pub match_id: Option<String>,
    pub agent_id: Option<u64>,
}

// OKX API types
#[derive(Debug, Serialize)]
pub struct OkxTransferRequest {
    pub from_addr: String,
    pub to_addr: String,
    pub token_symbol: String,
    pub token_amount: String,
    pub chain_id: String,
}

#[derive(Debug, Deserialize)]
pub struct OkxTransferResponse {
    pub code: String,
    pub msg: String,
    pub data: Option<Vec<OkxTransferData>>,
}

#[derive(Debug, Deserialize)]
pub struct OkxTransferData {
    pub tx_hash: Option<String>,
}
