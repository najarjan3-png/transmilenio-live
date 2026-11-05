# GTFS Realtime validation

This branch adds a protected diagnostic endpoint for the official TransMilenio VehiclePositions feed.

## Endpoint

`GET /api/gtfs/health`

Requires the existing `TRANSIT_BRIDGE_TOKEN` as a Bearer token. It downloads the official protobuf feed, decodes the GTFS-Realtime header and VehiclePosition entities, and reports:

- HTTP response status, content type, response size and download/decode duration.
- Feed header timestamp and number of entities.
- Number of vehicle entities and entities with coordinates.
- Position timestamp age (minimum, median, p95 and maximum).
- A small sample of vehicle identifiers, labels, plates, route IDs, coordinates, speed and bearing where supplied.

The endpoint is diagnostic only. It does not replace Croma or change production fleet behavior.

## Acceptance criteria

A single successful request is not enough to establish feed freshness. Run repeated requests over at least 10 minutes and retain each response's `checkedAt`, `feedTimestamp`, age distribution, and HTTP result.

Proposed project thresholds:

- No mandatory paid API key or paid data provider.
- Position age p95 at or below 90 seconds.
- Prefer median position age at or below 30 seconds.
- Coordinates and timestamps must be present for a useful majority of vehicle records.
- Vehicle identifiers must remain stable between consecutive captures.
- Route IDs must be joinable to the static GTFS schedule before presenting route names/codes.

A feed header timestamp alone is not proof that individual vehicle positions are fresh. The decoder measures each VehiclePosition timestamp separately.

## Current validation limitation

The development environment used to prepare this branch could not resolve external hostnames, and the web retrieval service returned HTTP 500 when opening the binary protobuf feed. This is an environment/access limitation, not proof that the TransMilenio feed is unavailable. A deployed preview endpoint or a local environment with outbound network access is required for the actual repeated measurement.

## Source

- Official TransMilenio feed directory: https://gis.transmilenio.gov.co/gtfs/
- Official announcement: https://www.transmilenio.gov.co/comunicaciones/noticias-de-transmilenio/especiales-transmilenio/datos-abiertos-tiempo-real-transmilenio-conecta-operacion-sistema-tecnologia-ciudad
- GTFS Realtime reference: https://gtfs.org/documentation/realtime/reference/
