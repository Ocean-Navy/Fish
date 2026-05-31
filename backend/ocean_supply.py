from __future__ import annotations

import json
import math
import statistics
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

DEFAULT_DASHBOARD_ENDPOINTS = [
    "https://api.oncompute.ai/envs",
    "https://api.oncompute.ai/nodes",
    "https://api.oncompute.ai/summary",
    "https://api.oncompute.ai/all-summary",
    "https://analytics.oncompute.ai/global-stats",
    "https://analytics.oncompute.ai/gpu-popularity",
]

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_PATH = ROOT / "data" / "sample_supply.json"
NODE_ENDPOINTS_PATH = ROOT / "data" / "node_endpoints.txt"


@dataclass
class SourceResult:
    name: str
    state: str
    message: str
    url: Optional[str] = None


@dataclass
class ComputeResource:
    timestamp: str
    source: str
    providerId: str
    providerLabel: str
    nodeEndpoint: str
    environmentId: str
    region: str
    resourceType: str
    resourceName: str
    total: float
    inUse: float
    available: float
    feeToken: str
    pricePerMinute: Optional[float]
    pricePerHour: Optional[float]
    status: str
    raw: Dict[str, Any]


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def http_get_json(url: str, timeout: float = 8.0) -> Any:
    request = urllib.request.Request(url, headers={"User-Agent": "FishDashboard/0.1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        text = response.read().decode("utf-8", errors="replace")
    return json.loads(text)


def load_sample() -> Dict[str, Any]:
    return json.loads(SAMPLE_PATH.read_text())


def read_node_endpoints() -> List[str]:
    if not NODE_ENDPOINTS_PATH.exists():
        return []
    endpoints = []
    for line in NODE_ENDPOINTS_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        endpoints.append(line.rstrip("/"))
    return endpoints


def walk_json(obj: Any) -> Iterable[Dict[str, Any]]:
    """Yield dict nodes from an arbitrary JSON shape."""
    if isinstance(obj, dict):
        yield obj
        for value in obj.values():
            yield from walk_json(value)
    elif isinstance(obj, list):
        for item in obj:
            yield from walk_json(item)


def pick_first(d: Dict[str, Any], keys: List[str], default: Any = None) -> Any:
    for key in keys:
        if key in d and d[key] not in (None, ""):
            return d[key]
    return default


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        if isinstance(value, str):
            cleaned = value.replace("$", "").replace("/hr", "").replace(",", "").strip()
            return float(cleaned)
        return float(value)
    except Exception:
        return default


def looks_like_gpu_name(value: str) -> bool:
    value = value.lower()
    return any(token in value for token in ["h200", "h100", "a100", "a6000", "l40", "gpu", "rtx", "mi300"])


def infer_resource_type(row: Dict[str, Any]) -> str:
    explicit = str(pick_first(row, ["resourceType", "type", "kind", "resource_type"], "")).lower()
    if "gpu" in explicit:
        return "gpu"
    if "cpu" in explicit:
        return "cpu"
    if "ram" in explicit or "memory" in explicit:
        return "ram"
    if "disk" in explicit or "storage" in explicit:
        return "disk"
    name = str(pick_first(row, ["resource", "resourceName", "name", "description", "gpu", "gpuType", "gpu_type"], ""))
    if looks_like_gpu_name(name):
        return "gpu"
    return "unknown"


def normalize_price(row: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
    # Prefer explicit hourly fields if present.
    hourly = pick_first(row, ["pricePerHour", "price_per_hour", "usdHr", "usd_hr", "priceUsdHr", "price"], None)
    if hourly is not None:
        value = to_float(hourly, math.nan)
        if not math.isnan(value):
            # If very tiny value, it might be per minute. Otherwise treat as hourly.
            if value < 0.5:
                return value, value * 60
            return value / 60, value

    minute = pick_first(row, ["pricePerMinute", "price_per_minute", "rate", "minutePrice"], None)
    if minute is not None:
        value = to_float(minute, math.nan)
        if not math.isnan(value):
            return value, value * 60

    fees = pick_first(row, ["fees", "pricing", "prices"], None)
    if isinstance(fees, list):
        for fee in fees:
            if isinstance(fee, dict):
                minute = pick_first(fee, ["price", "pricePerMinute", "amount"], None)
                if minute is not None:
                    value = to_float(minute, math.nan)
                    if not math.isnan(value):
                        # Ocean fees are often per minute in configured resource units.
                        return value, value * 60
    elif isinstance(fees, dict):
        minute = pick_first(fees, ["price", "pricePerMinute", "amount"], None)
        if minute is not None:
            value = to_float(minute, math.nan)
            if not math.isnan(value):
                return value, value * 60

    return None, None


def normalize_dicts(payload: Any, source_name: str, source_url: str) -> List[ComputeResource]:
    timestamp = utc_now()
    resources: List[ComputeResource] = []
    for d in walk_json(payload):
        resource_type = infer_resource_type(d)
        if resource_type == "unknown":
            continue

        resource_name = str(pick_first(d, ["resourceName", "resource", "name", "description", "gpu", "gpuType", "gpu_type", "type"], resource_type.upper()))
        total = to_float(pick_first(d, ["total", "count", "quantity", "max", "availableTotal", "gpus"], 0), 0)
        in_use = to_float(pick_first(d, ["inUse", "in_use", "used", "running", "busy"], 0), 0)
        available = to_float(pick_first(d, ["available", "free", "remaining"], max(total - in_use, 0)), max(total - in_use, 0))
        if total <= 0 and available > 0:
            total = available + in_use
        if total <= 0 and resource_type == "gpu":
            total = 1
            available = max(1 - in_use, 0)

        ppm, pph = normalize_price(d)
        provider_id = str(pick_first(d, ["providerId", "provider", "owner", "ownerWallet", "wallet", "nodeId", "id"], source_name))
        env_id = str(pick_first(d, ["environmentId", "envId", "id", "name"], "unknown-env"))
        region = str(pick_first(d, ["region", "location", "country", "zone"], "unknown"))
        fee_token = str(pick_first(d, ["feeToken", "token", "paymentToken", "symbol"], "unknown"))

        resources.append(
            ComputeResource(
                timestamp=timestamp,
                source=source_name,
                providerId=provider_id,
                providerLabel=provider_id[:18],
                nodeEndpoint=source_url,
                environmentId=env_id,
                region=region,
                resourceType=resource_type,
                resourceName=resource_name,
                total=total,
                inUse=in_use,
                available=available,
                feeToken=fee_token,
                pricePerMinute=ppm,
                pricePerHour=pph,
                status="available" if available > 0 else "busy" if total > 0 else "unknown",
                raw=d,
            )
        )
    return resources


def fetch_direct_node(endpoint: str) -> Tuple[List[ComputeResource], SourceResult]:
    url = f"{endpoint.rstrip('/')}/api/services/computeEnvironments"
    try:
        payload = http_get_json(url)
        resources = normalize_dicts(payload, "direct-node", endpoint)
        return resources, SourceResult(name="direct-node", state="live", message=f"Fetched {len(resources)} resources", url=url)
    except Exception as exc:
        return [], SourceResult(name="direct-node", state="unavailable", message=str(exc), url=url)


def fetch_dashboard_endpoint(url: str) -> Tuple[List[ComputeResource], SourceResult]:
    try:
        payload = http_get_json(url)
        resources = normalize_dicts(payload, "dashboard-api", url)
        return resources, SourceResult(name="dashboard-api", state="live", message=f"Fetched {len(resources)} resources", url=url)
    except Exception as exc:
        return [], SourceResult(name="dashboard-api", state="unavailable", message=str(exc), url=url)


def summarize(resources: List[ComputeResource], sources: List[SourceResult], state: str) -> Dict[str, Any]:
    gpu_resources = [r for r in resources if r.resourceType == "gpu"]
    provider_ids = {r.providerId for r in gpu_resources}
    total_gpus = sum(r.total for r in gpu_resources)
    available_gpus = sum(r.available for r in gpu_resources)
    h200_prices = [r.pricePerHour for r in gpu_resources if r.pricePerHour is not None and "h200" in r.resourceName.lower()]
    h200_from = min(h200_prices) if h200_prices else None

    grouped: Dict[str, List[ComputeResource]] = {}
    for r in gpu_resources:
        key = r.resourceName or "GPU"
        grouped.setdefault(key, []).append(r)

    gpu_supply = []
    for gpu, rows in grouped.items():
        prices = [r.pricePerHour for r in rows if r.pricePerHour is not None]
        gpu_supply.append({
            "gpu": gpu,
            "total": sum(r.total for r in rows),
            "available": sum(r.available for r in rows),
            "providers": len({r.providerId for r in rows}),
            "lowestUsdHr": min(prices) if prices else None,
            "medianUsdHr": statistics.median(prices) if prices else None,
            "regions": sorted({r.region for r in rows if r.region}),
        })

    providers = []
    provider_groups: Dict[str, List[ComputeResource]] = {}
    for r in gpu_resources:
        provider_groups.setdefault(r.providerId, []).append(r)
    for provider_id, rows in provider_groups.items():
        prices = [r.pricePerHour for r in rows if r.pricePerHour is not None]
        providers.append({
            "providerId": provider_id,
            "label": rows[0].providerLabel,
            "region": rows[0].region,
            "gpuTypes": sorted({r.resourceName for r in rows}),
            "availableGpus": sum(r.available for r in rows),
            "lowestUsdHr": min(prices) if prices else None,
            "uptime7d": None,
            "benchmarkStatus": "needs benchmark",
            "pilotEligible": sum(r.available for r in rows) > 0,
        })

    return {
        "dataState": state,
        "lastUpdated": utc_now(),
        "sources": [asdict(s) for s in sources],
        "kpis": {
            "totalGpus": total_gpus,
            "availableGpus": available_gpus,
            "providerCount": len(provider_ids),
            "h200FromUsdHr": h200_from,
            "oceanNativeJobs": 0,
            "providerPayoutUsd": 0,
        },
        "gpuSupply": gpu_supply,
        "providers": providers,
    }


def collect_summary() -> Dict[str, Any]:
    resources: List[ComputeResource] = []
    sources: List[SourceResult] = []

    for url in DEFAULT_DASHBOARD_ENDPOINTS:
        rows, source = fetch_dashboard_endpoint(url)
        sources.append(source)
        resources.extend(rows)

    for endpoint in read_node_endpoints():
        rows, source = fetch_direct_node(endpoint)
        sources.append(source)
        resources.extend(rows)

    if resources:
        return summarize(resources, sources, "live")

    sample = load_sample()
    sample["sources"] = [asdict(s) for s in sources] + sample.get("sources", [])
    sample["lastUpdated"] = utc_now()
    sample["dataState"] = "sample"
    return sample


def collect_resources() -> Dict[str, Any]:
    summary = collect_summary()
    # In sample mode, resources may not exist. Convert provider/gpu rows loosely.
    return {"dataState": summary.get("dataState", "sample"), "resources": []}


if __name__ == "__main__":
    print(json.dumps(collect_summary(), indent=2))
