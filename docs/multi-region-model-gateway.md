# Multi-Region Model Gateway Design

This document describes the recommended architecture for a multi-region model gateway serving Taiwan, Japan, Vietnam, and future regions.

The core decision is:

> Use a central control plane for product, policy, billing, and routing decisions. Use regional model gateways for inference execution. Keep KV cache regional first, then add global cache only through a future adapter.

## Architecture Summary

```text
                          User / API Client
                                │
                                v
┌────────────────────────────────────────────────────────────┐
│ Global Gateway / Control Plane                              │
│                                                            │
│ - Auth / API keys                                           │
│ - RBAC                                                      │
│ - Billing / usage                                           │
│ - Model registry                                            │
│ - Data residency policy                                     │
│ - Region selection                                          │
│ - Fallback policy                                           │
└───────────────────────┬────────────────────────────────────┘
                        │
        ┌───────────────┼────────────────┐
        │               │                │
        v               v                v
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ TW Region    │ │ JP Region    │ │ VN Region    │
│ Model GW     │ │ Model GW     │ │ Model GW     │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       v                v                v
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ llm-d router │ │ llm-d router │ │ llm-d router │
│ vLLM/SGLang  │ │ vLLM/SGLang  │ │ vLLM/SGLang  │
│ GPU nodes    │ │ GPU nodes    │ │ GPU nodes    │
│ Local cache  │ │ Local cache  │ │ Local cache  │
└──────────────┘ └──────────────┘ └──────────────┘
```

The global gateway should not directly manage every GPU replica. It should choose the best region. Inside each region, llm-d or a similar inference router should choose the best runtime replica.

## Routing Boundaries

There are two separate routing layers.

```text
Global routing:
Choose the region.

Regional inference routing:
Choose the serving backend inside the selected region.
```

Global routing should consider:

- User location
- Organization policy
- Data residency
- Model availability
- Region health
- Estimated region latency
- Region-level queue pressure
- Cost and fallback policy

Regional inference routing should consider:

- Prefix cache hit probability
- Runtime queue depth
- GPU utilization
- TTFT
- tokens/sec
- Error rate
- vLLM / SGLang / TRT-LLM health

llm-d is a good fit for the regional inference routing layer because it can optimize around prefix cache awareness, load awareness, and predicted latency scheduling. The product gateway should still own tenant policy, billing, data boundaries, and cross-region decisions.

## KV Cache Decision

For the first version, KV cache should be region-local.

```text
Session A in TW region
        │
        v
TW model gateway
        │
        v
TW local KV cache
```

Do not try to make KV cache global in the first version.

Reasons:

- KV cache is large and latency-sensitive.
- Cross-region transfer can be slower than recomputing prefill.
- Cache state is tied to model version, tokenizer, runtime, tensor-parallel layout, and serving engine.
- Moving cache across regions introduces consistency, security, tenancy, and invalidation problems.
- A bad global cache can make tail latency worse.

The practical rule is:

> A session's KV cache lives in the region where the session is currently executing.

## Session Affinity

Use session affinity for multi-turn workloads.

```text
First request:
User -> Global Gateway -> TW Model Gateway

Follow-up request in same session:
User -> Global Gateway -> TW Model Gateway
```

The global gateway should store a lightweight session placement record:

```text
session_id
organization_id
project_id
selected_region
selected_model
created_at
last_seen_at
ttl
fallback_allowed
```

This record is not the KV cache. It only tells the gateway where the active session should continue.

Recommended behavior:

- New sessions can be routed to the best available region.
- Existing sessions should stay in the same region while the region is healthy.
- If the region becomes unhealthy, fail over to another region and recompute context.
- Do not attempt to migrate KV cache during early versions.

## Cross-Region Fallback

When a region fails or is overloaded, use a controlled fallback.

```text
TW session
   │
   ├── TW healthy: continue in TW, reuse local KV cache
   │
   └── TW unhealthy: move to JP, lose KV cache, recompute prompt/context
```

This is acceptable because correctness is more important than preserving cache. The user may see a slower first token after failover, but the system remains available.

Fallback should be explicit and observable:

```text
fallback_reason:
- region_unhealthy
- queue_timeout
- model_unavailable
- data_residency_override_denied
- manual_failover
```

## Future Global Cache Adapter

Global KV cache should be treated as a future add-on, not part of the core gateway contract.

Use an adapter interface:

```text
┌──────────────────────┐
│ Model Gateway         │
└──────────┬───────────┘
           │
           v
┌──────────────────────┐
│ Cache Adapter         │
│                      │
│ - local only          │
│ - remote object store │
│ - cross-region cache  │
│ - vendor runtime API  │
└──────────────────────┘
```

The first adapter should be local-only:

```text
CacheAdapter = LocalRuntimeCacheAdapter
```

Future adapters can be added later:

```text
CacheAdapter = GlobalKvCacheAdapter
CacheAdapter = RuntimeSpecificCacheAdapter
CacheAdapter = ObjectStoragePrefixStateAdapter
```

The application should not assume global cache exists. It should only ask the adapter what is possible.

Example capabilities:

```text
supportsLocalReuse: true
supportsCrossReplicaReuse: maybe
supportsCrossRegionReuse: false
supportsExport: false
supportsImport: false
```

Future global cache should only be enabled when these problems are solved:

- Cache format compatibility
- Model and tokenizer version pinning
- Runtime compatibility
- Tenant isolation
- Encryption
- TTL and invalidation
- Region policy enforcement
- Performance proof that transfer beats recompute

## Data and Analytics Placement

Usage metadata and conversation content should be separated.

```text
Gateway request
      │
      ├── Usage metadata
      │       └── regional ClickHouse / central summary
      │
      ├── Conversation content
      │       └── only if product feature or explicit opt-in
      │
      └── Training dataset
              └── only after consent, redaction, anonymization, review
```

Recommended storage split:

```text
Central PostgreSQL:
- users
- organizations
- projects
- API keys
- billing ledger
- model registry
- usage summary
- session placement metadata

Regional ClickHouse:
- request metadata
- latency
- token usage
- cost
- error status
- routing decisions

Regional object storage:
- full conversation content only when enabled
- short retention by default
- training candidate data only with consent
```

Do not use PostgreSQL as the long-term store for all full API request and response content.

## Training Data Boundary

Training data must not be a side effect of logging.

Use this policy:

```text
API traffic:
metadata only by default

First-party product chat:
may store conversation history as a product feature

Training dataset:
requires explicit consent and a separate processing pipeline
```

The training dataset pipeline should include:

- Consent check
- PII redaction
- Tenant isolation
- Data residency validation
- Dataset versioning
- Source traceability
- Deletion and revocation flow
- Human or automated quality review

## Recommended Implementation Phases

### Phase 1: Regional Baseline

- Deploy one model gateway per region.
- Use Kubernetes services for vLLM/SGLang/TRT-LLM.
- Use llm-d inside each region for inference routing.
- Keep KV cache local to the runtime and region.
- Add session affinity in the global gateway.

### Phase 2: Queue-Aware Cross-Region Routing

- Add region health reporting.
- Track queue depth and TTFT per region.
- Route new sessions to the best region.
- Keep existing sessions sticky unless region health fails.

### Phase 3: Regional Analytics

- Store metadata in regional ClickHouse.
- Sync summaries to the central control plane.
- Keep full content storage opt-in and region-local.

### Phase 4: Cache Adapter

- Add a cache adapter interface.
- Start with local-only capability reporting.
- Add runtime-specific cache integration only after benchmarking.

### Phase 5: Optional Global Cache

- Evaluate cross-region KV cache only when traffic volume and latency data prove it is worth the complexity.
- Keep global cache as an optional adapter, not a core dependency.

## Final Recommendation

Start with this rule:

> One session, one region, one local KV cache lifecycle.

Then add:

> Cross-region routing for new sessions and failover, not cross-region KV migration.

Global KV cache should be a future optimization behind an adapter. The core product should remain correct, observable, and reliable even when no cross-region cache exists.
