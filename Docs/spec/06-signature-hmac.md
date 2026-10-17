# 06 — Signature Specification (HMAC) & Reference Code

Scope: the exact byte-level signing recipe used for event records and checkout receipts, plus reference code and test vectors (Section 5.3 + Appendix A). Follow literally; the grader recomputes every signature with its copy of the salt and compares for equality.

Used for: event records (`/events`, and each event inside `/score` and offline-sync results) and checkout receipts (`/checkout`).

| Element | Definition |
| --- | --- |
| Key | Value of env `DAY1_SALT`, encoded as UTF-8 bytes (**not** hex-decoded, **not** trimmed). |
| `id` | Event: the `event_id`. Receipt: the `order_id`. |
| `payload` | Canonical JSON string of the record's payload object (events: the request's `payload`; receipts: `receipt.payload`). |
| Canonical JSON | Recursively sorted object keys (ascending by Unicode code point); no whitespace (separators `,` and `:`); UTF-8; non-ASCII characters **not** escaped; integers without decimal point; `true`/`false`/`null` lowercase. Array order preserved. |
| Message | `id + "|" + payload` as UTF-8 bytes. |
| Algorithm / output | HMAC-SHA256; output = lowercase hex, 64 characters. |

Where signatures appear: see [11-leagues-events-scoring.md](11-leagues-events-scoring.md) (events/score), [14-store-checkout.md](14-store-checkout.md) (receipts), [16-offline-sync.md](16-offline-sync.md) (applied score_event results). Salt sourcing rules: [03-infra-and-stack.md](03-infra-and-stack.md).

## Reference implementation (Python)

```python
import hmac, hashlib, json

def canonical(obj):  # Section 5.3
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

def sign(salt: str, id_: str, payload_obj) -> str:
    msg = (id_ + "|" + canonical(payload_obj)).encode("utf-8")
    return hmac.new(salt.encode("utf-8"), msg, hashlib.sha256).hexdigest()

def lots_key(seed: int, league_id: str, team_id: str) -> str:  # Section 5.10, draw_lots
    return hashlib.sha256(f"{seed}|{league_id}|{team_id}".encode("utf-8")).hexdigest()
```

Caveat for non-Python ports: Python's `json.dumps` emits floats like `1.0` with a decimal point; the spec says integers must serialize without a decimal point, so keep integer-typed values as integers.

## Test vectors

**Vector 1 (signature).** Salt `demo-salt`, id `evt-1`, payload `{"team_id":"t1","event_type":"goal"}`:
- canonical payload = `{"event_type":"goal","team_id":"t1"}`
- signature = `972a8b558690b19121cc5bea84978f85e8eb15a3735018db36616bab1d7ec501`

**Vector 2 (drawing of lots).** Seed `42`, league `lg-1`; teams ordered **ascending by key**, first = best:
- t1 → `0613316991ce0ac31e88d6003e3ff4d5e21bb072ac5f81b42c0cdc6598453293`
- t2 → `e3e3a14e22727f936e1f288cf5d02a8a9362b1da13c5432725fc10b2c7955dd9`
- t3 → `c8f28e3c2f1eb6c4f636b4f57050e3362a2b39c07fda9b61742a26dd20397028`
- (Resulting order by ascending hex key: t1, t3, t2.)

Draw-lots usage in standings: [12-standings.md](12-standings.md).
