use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    response::Response,
};
use futures::{SinkExt, StreamExt};
use serde_json::json;

use crate::services::match_service::MatchUpdate;
use crate::AppState;

/// WebSocket handler for live match updates
pub async fn match_websocket(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Path(match_id): Path<String>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state, match_id))
}

async fn handle_socket(socket: WebSocket, state: AppState, match_id: String) {
    let (mut sender, mut receiver) = socket.split();

    // Subscribe to match updates
    let rx = match state.match_service.subscribe(&match_id).await {
        Some(rx) => rx,
        None => {
            let _ = sender
                .send(Message::Text(
                    json!({"error": "Match not found"}).to_string(),
                ))
                .await;
            return;
        }
    };

    // Send initial state
    if let Ok(match_state) = state.match_service.get_match_state(&match_id).await {
        let msg = json!({
            "type": "state",
            "data": match_state
        });
        let _ = sender.send(Message::Text(msg.to_string())).await;
    }

    // Task to forward match updates
    let mut rx = rx;
    let forward_task = tokio::spawn(async move {
        while let Ok(update) = rx.recv().await {
            let msg = match update {
                MatchUpdate::StateUpdate(state) => {
                    json!({
                        "type": "state",
                        "data": state
                    })
                }
                MatchUpdate::TradeExecuted {
                    agent_id,
                    trade_id,
                    symbol,
                    action,
                    side,
                    size,
                    price,
                    leverage,
                    realized_pnl,
                    new_balance,
                    new_pnl,
                    timestamp,
                } => {
                    json!({
                        "type": "trade",
                        "data": {
                            "agent_id": agent_id,
                            "trade_id": trade_id,
                            "symbol": symbol,
                            "action": action,
                            "side": side,
                            "size": size,
                            "price": price,
                            "leverage": leverage,
                            "realized_pnl": realized_pnl,
                            "new_balance": new_balance,
                            "new_pnl": new_pnl,
                            "timestamp": timestamp
                        }
                    })
                }
                MatchUpdate::MatchStarted => {
                    json!({
                        "type": "started"
                    })
                }
                MatchUpdate::MatchEnded {
                    winner_id,
                    agent1_pnl,
                    agent2_pnl,
                } => {
                    json!({
                        "type": "ended",
                        "data": {
                            "winner_id": winner_id,
                            "agent1_pnl": agent1_pnl,
                            "agent2_pnl": agent2_pnl
                        }
                    })
                }
            };

            if sender.send(Message::Text(msg.to_string())).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages (pings, etc.)
    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Ping(data)) => {
                // Pong is handled automatically by axum
            }
            Ok(Message::Close(_)) => {
                break;
            }
            Err(_) => {
                break;
            }
            _ => {}
        }
    }

    forward_task.abort();
}
