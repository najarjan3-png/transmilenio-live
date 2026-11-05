import { timingSafeEqual } from "node:crypto";

import { decodeVehiclePositions } from "@/lib/gtfs-realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FEED_URL = "https://gis.transmilenio.gov.co/gtfs/vehiclepos.pb";
const MAX_BYTES = 12 * 1024 * 1024;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function authorized(request: Request, expected: string): boolean {
  const supplied = request.headers.get("authorization") ?? "";
  if (!supplied.startsWith("Bearer ")) return false;
  const actual = Buffer.from(supplied.slice(7));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export async function GET(request: Request): Promise<Response> {
  const token = process.env.TRANSIT_BRIDGE_TOKEN;
  if (!token) return json({ ok: false, error: "TRANSIT_BRIDGE_TOKEN no está configurado." }, 503);
  if (!authorized(request, token)) return json({ ok: false, error: "No autorizado." }, 401);

  const startedAt = Date.now();
  try {
    const response = await fetch(FEED_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "TransMilenio-Live-GTFS-Probe/1.0" },
    });
    if (!response.ok) return json({ ok: false, error: "El feed respondió HTTP " + response.status, elapsedMs: Date.now() - startedAt }, 502);

    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_BYTES) return json({ ok: false, error: "El feed supera el límite de tamaño de diagnóstico." }, 502);

    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) return json({ ok: false, error: "El feed supera el límite de tamaño de diagnóstico." }, 502);

    const diagnostics = decodeVehiclePositions(buffer);
    const ages = diagnostics.ageSeconds;
    return json({
      ok: true,
      source: FEED_URL,
      checkedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      httpStatus: response.status,
      contentType: response.headers.get("content-type"),
      bytes: buffer.byteLength,
      ...diagnostics,
      assessment: ages
        ? {
            under30SecondsPercent: null,
            p95Under90Seconds: ages.p95 <= 90,
            oldestPositionSeconds: ages.max,
            note: "El porcentaje bajo 30 segundos se medirá en un sondeo repetido; esta consulta mide la antigüedad de las posiciones en una sola captura.",
          }
        : {
            p95Under90Seconds: false,
            note: "El feed no contiene marcas de tiempo suficientes para medir la antigüedad de las posiciones.",
          },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return json({ ok: false, error: "No se pudo descargar o decodificar el feed GTFS.", detail: message, elapsedMs: Date.now() - startedAt }, 502);
  }
}
