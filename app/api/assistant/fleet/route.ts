import { timingSafeEqual } from "node:crypto";

import { getFleet } from "@/lib/transit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function authorized(request: Request, expected: string): boolean {
  const supplied = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!supplied.startsWith(prefix)) return false;

  const actualBytes = Buffer.from(supplied.slice(prefix.length));
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export async function GET(request: Request): Promise<Response> {
  const token = process.env.TRANSIT_BRIDGE_TOKEN;
  if (!token) {
    return json({ ok: false, error: { code: "bridge_not_configured", message: "El puente todavía no está configurado." } }, 503);
  }
  if (!authorized(request, token)) {
    return json({ ok: false, error: { code: "unauthorized", message: "Se requiere un token válido." } }, 401);
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (!query || query.length > 80) {
    return json({ ok: false, error: { code: "invalid_query", message: "Indica q con una placa, identificador, ruta o estación (máximo 80 caracteres)." } }, 400);
  }

  const parsedLimit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(50, Math.max(1, parsedLimit)) : 20;
  const needle = normalize(query);

  const fleet = await getFleet();
  if (!fleet.ok) {
    return json({ ok: false, error: fleet.error, asOf: null, count: 0, matches: [] }, 502);
  }

  const matches = fleet.data.buses.flatMap((bus) => {
    const route = bus.route ? fleet.data.routes[bus.route] : undefined;
    const searchable = [
      bus.plate,
      bus.label,
      bus.id,
      bus.stop,
      bus.route,
      route?.code,
      route?.name,
    ].filter((value): value is string => Boolean(value));

    if (!searchable.some((value) => normalize(value).includes(needle))) return [];

    const reportedAtMs = bus.reportedAt ? Date.parse(bus.reportedAt) : NaN;
    const reportAgeSeconds = Number.isFinite(reportedAtMs)
      ? Math.max(0, Math.floor((Date.now() - reportedAtMs) / 1000))
      : null;

    return [{
      id: bus.id,
      plate: bus.plate,
      label: bus.label,
      routeId: bus.route,
      routeCode: route?.code ?? null,
      routeName: route?.name ?? null,
      system: route?.system ?? null,
      lastReportedStop: bus.stop,
      stopStatus: bus.status,
      latitude: bus.lat,
      longitude: bus.lon,
      reportedAt: bus.reportedAt,
      reportAgeSeconds,
    }];
  });

  return json({
    ok: true,
    query,
    asOf: fleet.data.asOf,
    fleetTotal: fleet.data.total,
    count: matches.length,
    returned: Math.min(matches.length, limit),
    matches: matches.slice(0, limit),
    note: "Las coordenadas corresponden al último reporte recibido; no garantizan la posición exacta en tiempo real.",
  });
}
