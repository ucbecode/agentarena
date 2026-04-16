# Build stage
FROM rust:latest as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first for dependency caching
COPY backend/Cargo.toml backend/Cargo.lock ./backend/

# Create dummy src to build dependencies
RUN mkdir -p backend/src && \
    echo "fn main() {}" > backend/src/main.rs

# Build dependencies only (cached layer)
WORKDIR /app/backend
RUN cargo build --release && rm -rf src target/release/deps/agent_arena*

# Copy actual source code
COPY backend/src ./src/

# Build final binary
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy binary from builder
COPY --from=builder /app/backend/target/release/agent-arena-backend /app/agent-arena-backend

# Expose port
EXPOSE 3460

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3460/health || exit 1

# Run the binary
CMD ["./agent-arena-backend"]
