use axum::{
    body::Body,
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::Response,
    Json,
};
use ethers::{
    types::{Address, Signature, H256},
    utils::keccak256,
};
use serde_json::json;
use std::str::FromStr;

/// Authentication extractor for signed requests
#[derive(Debug, Clone)]
pub struct AuthenticatedAgent {
    pub agent_id: u64,
    pub wallet: Address,
}

/// Verify EIP-712 signature for trade requests
/// The client signs: keccak256(path + timestamp + body_hash)
pub async fn verify_signature(
    request: Request,
    next: Next,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    // For read-only endpoints, skip signature verification
    if request.method() == axum::http::Method::GET {
        return Ok(next.run(request).await);
    }

    // Get signature from header
    let sig_header = request.headers()
        .get("X-Agent-Signature")
        .and_then(|v| v.to_str().ok());

    let timestamp_header = request.headers()
        .get("X-Request-Timestamp")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok());

    let wallet_header = request.headers()
        .get("X-Agent-Wallet")
        .and_then(|v| v.to_str().ok());

    let agent_id_header = request.headers()
        .get("X-Agent-Id")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok());

    // Require all auth headers for write endpoints
    let (signature_str, timestamp, wallet_str, agent_id) = match (sig_header, timestamp_header, wallet_header, agent_id_header) {
        (Some(s), Some(t), Some(w), Some(a)) => (s, t, w, a),
        _ => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "error": "Missing authentication headers",
                    "required": ["X-Agent-Signature", "X-Request-Timestamp", "X-Agent-Wallet", "X-Agent-Id"]
                })),
            ));
        }
    };

    // Check timestamp is within 5 minutes (prevent replay attacks)
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    if now.abs_diff(timestamp) > 300 {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Request timestamp expired or in future" })),
        ));
    }

    // Parse wallet address
    let wallet = match Address::from_str(wallet_str) {
        Ok(w) => w,
        Err(_) => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Invalid wallet address" })),
            ));
        }
    };

    // Parse signature (hex string, 65 bytes)
    let sig_bytes = match hex::decode(signature_str.trim_start_matches("0x")) {
        Ok(b) if b.len() == 65 => b,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Invalid signature format (expected 65-byte hex)" })),
            ));
        }
    };

    let signature = match Signature::try_from(sig_bytes.as_slice()) {
        Ok(s) => s,
        Err(_) => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Invalid signature" })),
            ));
        }
    };

    // Get request path and body for message construction
    let path = request.uri().path().to_string();

    // Extract body bytes for signature verification
    let (parts, body) = request.into_parts();
    let body_bytes = match axum::body::to_bytes(body, 1_000_000).await {
        Ok(b) => b,
        Err(_) => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Failed to read request body" })),
            ));
        }
    };

    // Construct message to verify: keccak256(path + timestamp + body)
    // This is a simplified EIP-712-like message
    let body_hash = keccak256(&body_bytes);
    let message = format!("{}:{}:0x{}", path, timestamp, hex::encode(body_hash));
    let message_hash = keccak256(message.as_bytes());

    // Create Ethereum signed message hash (EIP-191)
    let eth_message = format!("\x19Ethereum Signed Message:\n{}{}", message_hash.len(), hex::encode(message_hash));
    let eth_message_hash = keccak256(eth_message.as_bytes());

    // Recover signer address from signature
    let recovered = match signature.recover(H256::from(eth_message_hash)) {
        Ok(addr) => addr,
        Err(_) => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Failed to recover signer from signature" })),
            ));
        }
    };

    // Verify recovered address matches claimed wallet
    if recovered != wallet {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "error": "Signature verification failed",
                "expected": format!("{:?}", wallet),
                "recovered": format!("{:?}", recovered)
            })),
        ));
    }

    // Reconstruct request with body
    let request = Request::from_parts(parts, Body::from(body_bytes));

    // Add authenticated agent to request extensions
    let mut request = request;
    request.extensions_mut().insert(AuthenticatedAgent {
        agent_id,
        wallet,
    });

    Ok(next.run(request).await)
}

/// Extract authenticated agent from request (after middleware)
pub fn get_authenticated_agent(request: &Request) -> Option<&AuthenticatedAgent> {
    request.extensions().get::<AuthenticatedAgent>()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_timestamp_validation() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // Valid timestamp (within 5 minutes)
        assert!(now.abs_diff(now) <= 300);
        assert!(now.abs_diff(now + 60) <= 300);
        assert!(now.abs_diff(now - 60) <= 300);

        // Invalid timestamp (outside 5 minutes)
        assert!(now.abs_diff(now + 400) > 300);
        assert!(now.abs_diff(now - 400) > 300);
    }

    #[test]
    fn test_signature_length() {
        // Valid 65-byte signature
        let valid_sig = "0x" .to_string() + &"a".repeat(130);
        let decoded = hex::decode(valid_sig.trim_start_matches("0x")).unwrap();
        assert_eq!(decoded.len(), 65);

        // Invalid signature lengths
        let short_sig = "0x" .to_string() + &"a".repeat(64);
        let decoded = hex::decode(short_sig.trim_start_matches("0x")).unwrap();
        assert_ne!(decoded.len(), 65);
    }

    #[test]
    fn test_message_construction() {
        let path = "/api/matches/test-123/trade";
        let timestamp = 1704067200u64;
        let body = b"{}";
        let body_hash = keccak256(body);
        let message = format!("{}:{}:0x{}", path, timestamp, hex::encode(body_hash));

        assert!(message.contains(path));
        assert!(message.contains(&timestamp.to_string()));
        assert!(message.contains("0x"));
    }

    #[test]
    fn test_wallet_parsing() {
        // Valid address
        let valid = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
        assert!(Address::from_str(valid).is_ok());

        // Invalid address
        let invalid = "not-an-address";
        assert!(Address::from_str(invalid).is_err());

        // Too short
        let short = "0x742d35";
        assert!(Address::from_str(short).is_err());
    }
}
