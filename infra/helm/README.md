# LLM Gateway Helm Chart

This is the Helm chart for LLM Gateway. It is used to deploy LLM Gateway on a Kubernetes cluster.

The chart is published as an OCI artifact to GitHub Container Registry on every release.

## Installation

```bash
helm install llmgateway oci://ghcr.io/theopenco/charts/llmgateway
```

This installs the latest published version. To pin to a specific release, append `--version <version>` (matching a published release tag without the `v` prefix, e.g. `1.2.3`). Available versions are listed at https://github.com/theopenco/llmgateway/pkgs/container/charts%2Fllmgateway.

## Ingress / routing

The chart supports two routing backends:

### Kubernetes Gateway API — recommended

nginx Ingress (`kubernetes/ingress-nginx`) was archived in January 2026.
The replacement is the [Kubernetes Gateway API](https://gateway-api.sigs.k8s.io/).
[Envoy Gateway](https://gateway.envoyproxy.io/) is the recommended implementation.

**1. Install Envoy Gateway:**
```bash
helm install eg oci://docker.io/envoyproxy/gateway-helm \
  --version v1.4.0 -n envoy-gateway-system --create-namespace
```

**2. Create a GatewayClass and Gateway** (once per cluster):
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: envoy
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: llmgateway
  namespace: envoy-gateway-system
spec:
  gatewayClassName: envoy
  listeners:
    - name: http
      protocol: HTTP
      port: 80
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        mode: Terminate
        certificateRefs:
          - name: llmgateway-tls
```

**3. Enable HTTPRoutes in values:**
```yaml
httpRoutes:
  enabled: true
  gatewayName: llmgateway
  gatewayNamespace: envoy-gateway-system
  hosts:
    ui: app.example.com
    api: api.example.com
    gateway: gateway.example.com
    admin: admin.example.com
```

### Legacy Ingress (deprecated)

The `ingress` block still works with any Ingress controller that remains active
(Traefik, HAProxy, etc). Do not use with `ingress-nginx` — it is archived.

```yaml
ingress:
  enabled: true
  className: traefik
  hosts:
    ui: app.example.com
    api: api.example.com
    gateway: gateway.example.com
    admin: admin.example.com
```

The admin host serves the internal dashboard, including the system settings
page at `/settings`.

## Local development

To install directly from a checkout of this repository:

```bash
helm install llmgateway ./infra/helm/llmgateway
```
