-- Load test results analysis
-- Run with: docker exec postgres psql -U postgres -d db -f /path/to/analyze-load.sql
-- Or inline: docker exec postgres psql -U postgres -d db -c "$(cat scripts/analyze-load.sql)"

-- Per-minute breakdown: QPM, Input TPM, Output TPM, latency
SELECT
  DATE_TRUNC('minute', created_at)                                    AS minute,
  COUNT(*)                                                            AS qpm,
  SUM(prompt_tokens)                                                  AS input_tpm,
  SUM(completion_tokens)                                              AS output_tpm,
  ROUND(AVG(duration))                                                AS avg_ms,
  ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration))       AS p50_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration))       AS p95_ms,
  ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration))       AS p99_ms,
  COUNT(*) FILTER (WHERE unified_finish_reason NOT IN ('COMPLETED', 'TOOL_CALLS', 'LENGTH_LIMIT', 'length_limit')) AS errors
FROM log
WHERE
  created_at > NOW() - INTERVAL '15 minutes'
  AND used_provider = 'llm-d'
GROUP BY 1
ORDER BY 1;

-- Summary row: aggregate totals and pass/fail against targets
SELECT
  COUNT(*)                                                            AS total_requests,
  ROUND(COUNT(*) / EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) * 60)
                                                                      AS avg_qpm,
  ROUND(SUM(prompt_tokens)     / EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) * 60)
                                                                      AS avg_input_tpm,
  ROUND(SUM(completion_tokens) / EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) * 60)
                                                                      AS avg_output_tpm,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration))       AS p95_ms,
  ROUND(100.0 * COUNT(*) FILTER (WHERE unified_finish_reason NOT IN ('COMPLETED', 'TOOL_CALLS', 'LENGTH_LIMIT', 'length_limit')) / COUNT(*), 2)
                                                                      AS error_pct,
  CASE WHEN COUNT(*) / EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) * 60 > 500
    THEN 'PASS' ELSE 'FAIL' END                                       AS qpm_target,
  CASE WHEN SUM(prompt_tokens) / EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) * 60 > 20000000
    THEN 'PASS' ELSE 'FAIL' END                                       AS input_tpm_target,
  CASE WHEN SUM(completion_tokens) / EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) * 60 > 40000000
    THEN 'PASS' ELSE 'FAIL' END                                       AS output_tpm_target
FROM log
WHERE
  created_at > NOW() - INTERVAL '15 minutes'
  AND used_provider = 'llm-d';
