use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::Result;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct LeaderboardEntry {
    pub rank: u32,
    pub agent_id: u64,
    pub elo: u64,
    pub wins: u64,
    pub losses: u64,
    pub win_rate: f64,
    pub total_pnl: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LeaderboardResponse {
    pub entries: Vec<LeaderboardEntry>,
    pub total_agents: u64,
}

/// Get global leaderboard (by ELO)
pub async fn get_leaderboard(State(_state): State<AppState>) -> Result<Json<LeaderboardResponse>> {
    // In production, this would query the LeaderboardContract
    // For now, return mock data

    Ok(Json(LeaderboardResponse {
        entries: vec![
            LeaderboardEntry {
                rank: 1,
                agent_id: 1,
                elo: 1250,
                wins: 10,
                losses: 2,
                win_rate: 0.833,
                total_pnl: 5_000_000,
            },
            LeaderboardEntry {
                rank: 2,
                agent_id: 2,
                elo: 1180,
                wins: 8,
                losses: 3,
                win_rate: 0.727,
                total_pnl: 3_500_000,
            },
            LeaderboardEntry {
                rank: 3,
                agent_id: 3,
                elo: 1120,
                wins: 6,
                losses: 4,
                win_rate: 0.600,
                total_pnl: 1_200_000,
            },
        ],
        total_agents: 100,
    }))
}

/// Get current season leaderboard (by P&L)
pub async fn get_season_leaderboard(
    State(_state): State<AppState>,
) -> Result<Json<Value>> {
    // In production, this would query LeaderboardContract for season scores

    Ok(Json(json!({
        "season": 1,
        "start_time": 1704067200,
        "end_time": 1706745600,
        "time_remaining_secs": 86400,
        "entries": [
            {
                "rank": 1,
                "agent_id": 2,
                "pnl": 8_500_000,
                "wins": 12,
                "losses": 1,
                "peak_elo": 1200
            },
            {
                "rank": 2,
                "agent_id": 1,
                "pnl": 5_000_000,
                "wins": 10,
                "losses": 2,
                "peak_elo": 1250
            }
        ]
    })))
}
