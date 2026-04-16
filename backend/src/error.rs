use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug)]
pub enum AppError {
    BadRequest(String),
    NotFound(String),
    Unauthorized(String),
    PaymentRequired(serde_json::Value),
    Conflict(String),
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message, extra): (StatusCode, String, Option<serde_json::Value>) = match self {
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg, None),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg, None),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg, None),
            AppError::PaymentRequired(details) => {
                return (
                    StatusCode::PAYMENT_REQUIRED,
                    Json(json!({
                        "error": "Payment required",
                        "payment": details
                    })),
                )
                    .into_response();
            }
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg, None),
            AppError::Internal(msg) => {
                tracing::error!("Internal error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string(), None)
            }
        };

        let body = if let Some(extra) = extra {
            json!({ "error": message, "details": extra })
        } else {
            json!({ "error": message })
        };

        (status, Json(body)).into_response()
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Internal(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::BadRequest(err.to_string())
    }
}
