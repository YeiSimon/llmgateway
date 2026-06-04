CREATE DATABASE IF NOT EXISTS llmgateway;
USE llmgateway;

-- Raw gateway logs (append-only)
CREATE TABLE IF NOT EXISTS gateway_logs (
    id               String,
    organization_id  LowCardinality(String),
    project_id       LowCardinality(String),
    api_key_id       LowCardinality(String),
    user_id          LowCardinality(Nullable(String)),
    requested_model  LowCardinality(String),
    used_model       LowCardinality(String),
    used_provider    LowCardinality(String),
    input_tokens     Nullable(Int64)   CODEC(Delta, ZSTD(1)),
    output_tokens    Nullable(Int64)   CODEC(Delta, ZSTD(1)),
    cached_tokens    Nullable(Int64)   CODEC(Delta, ZSTD(1)),
    reasoning_tokens Nullable(Int64)   CODEC(Delta, ZSTD(1)),
    cost             Nullable(Decimal(18,10)) CODEC(ZSTD(1)),
    input_cost       Nullable(Decimal(18,10)) CODEC(ZSTD(1)),
    output_cost      Nullable(Decimal(18,10)) CODEC(ZSTD(1)),
    duration_ms      Nullable(Int64)   CODEC(Delta, ZSTD(1)),
    time_to_first_token Nullable(Int64) CODEC(Delta, ZSTD(1)),
    status_code      Nullable(Int16),
    has_error        UInt8,
    streamed         UInt8,
    cached           UInt8,
    finish_reason    LowCardinality(Nullable(String)),
    mode             LowCardinality(String),
    source           LowCardinality(Nullable(String)),
    trace_id         Nullable(String),
    created_at       DateTime64(3, 'UTC') CODEC(DoubleDelta, ZSTD(1)),

    INDEX idx_org_id      organization_id TYPE bloom_filter GRANULARITY 4,
    INDEX idx_project_id  project_id      TYPE bloom_filter GRANULARITY 4,
    INDEX idx_model       used_model      TYPE set(200)     GRANULARITY 2,
    INDEX idx_provider    used_provider   TYPE set(50)      GRANULARITY 2,
    INDEX idx_source      source          TYPE set(50)      GRANULARITY 2
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (organization_id, created_at, id)
TTL toDateTime(created_at) + INTERVAL 90 DAY
SETTINGS ttl_only_drop_parts = 1;

-- Materialized view: hourly cost rollup
CREATE TABLE IF NOT EXISTS cost_rollup_hourly (
    hour             DateTime CODEC(DoubleDelta, ZSTD(1)),
    organization_id  LowCardinality(String),
    project_id       LowCardinality(String),
    used_model       LowCardinality(String),
    used_provider    LowCardinality(String),
    source           LowCardinality(Nullable(String)),
    request_count    UInt64,
    error_count      UInt64,
    cache_count      UInt64,
    input_tokens     Int64,
    output_tokens    Int64,
    cached_tokens    Int64,
    cost_usd         Decimal(38, 10)
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (organization_id, project_id, hour, used_model, used_provider, source)
SETTINGS allow_nullable_key = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS cost_rollup_hourly_mv
TO cost_rollup_hourly AS
SELECT
    toStartOfHour(created_at) AS hour,
    organization_id, project_id, used_model, used_provider,
    source,
    toUInt64(1) AS request_count,
    toUInt64(has_error) AS error_count,
    toUInt64(cached) AS cache_count,
    ifNull(input_tokens, 0) AS input_tokens,
    ifNull(output_tokens, 0) AS output_tokens,
    ifNull(cached_tokens, 0) AS cached_tokens,
    ifNull(cost, 0) AS cost_usd
FROM gateway_logs;

-- Provider health 5-minute buckets
CREATE TABLE IF NOT EXISTS provider_health_5m (
    bucket_5m          DateTime CODEC(DoubleDelta, ZSTD(1)),
    provider           LowCardinality(String),
    total_requests     UInt64,
    error_requests     UInt64,
    throttled_requests UInt64,
    sum_latency_ms     Int64,
    requests_latency   UInt64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(bucket_5m)
ORDER BY (provider, bucket_5m);

CREATE MATERIALIZED VIEW IF NOT EXISTS provider_health_5m_mv
TO provider_health_5m AS
SELECT
    toStartOfFiveMinutes(created_at) AS bucket_5m,
    used_provider AS provider,
    toUInt64(1) AS total_requests,
    toUInt64(if(has_error = 1 AND status_code != 429, 1, 0)) AS error_requests,
    toUInt64(if(status_code = 429, 1, 0)) AS throttled_requests,
    ifNull(duration_ms, 0) AS sum_latency_ms,
    toUInt64(if(duration_ms IS NOT NULL, 1, 0)) AS requests_latency
FROM gateway_logs
WHERE used_provider IS NOT NULL;
