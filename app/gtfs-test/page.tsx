"use client";

import { useState } from "react";

type Diagnostics = {
  ok?: boolean;
  error?: string;
  detail?: string;
  source?: string;
  checkedAt?: string;
  elapsedMs?: number;
  httpStatus?: number;
  contentType?: string | null;
  bytes?: number;
  feedTimestamp?: string | null;
  entityCount?: number;
  vehicleEntityCount?: number;
  positionedVehicleCount?: number;
  missingPositionTimestampCount?: number;
  futureTimestampCount?: number;
  under30SecondsPercent?: number | null;
  under90SecondsPercent?: number | null;
  ageSeconds?: { min: number; median: number; p95: number; max: number } | null;
  samples?: Array<{
    id: string | null;
    label: string | null;
    licensePlate: string | null;
    routeId: string | null;
    latitude: number | null;
    longitude: number | null;
    positionTimestamp: string | null;
    ageSeconds: number | null;
  }>;
};

export default function GtfsTestPage() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState<Diagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function testFeed(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/gtfs/health", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = (await response.json()) as Diagnostics;
      if (!response.ok || !data.ok) setError(data.error ?? `Error HTTP ${response.status}`);
      else setResult(data);
    } catch {
      setError("No fue posible conectar con la prueba GTFS. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-5 py-12 text-foreground">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">TransMilenio Live · GTFS Realtime</p>
        <h1 className="text-3xl font-semibold tracking-tight">Diagnóstico del feed oficial</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Descarga una captura del feed de posiciones y mide la antigüedad real de los GPS, no solo la hora de publicación del archivo.
        </p>
      </div>

      <form onSubmit={testFeed} className="flex flex-col gap-4 rounded-xl border border-border p-5">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Token de acceso
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
            placeholder="Token de acceso del puente"
            className="h-11 rounded-md border border-border bg-background px-3 font-mono text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !token.trim()}
          className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Descargando y midiendo…" : "Medir una captura GTFS"}
        </button>
        <p className="text-xs leading-5 text-muted-foreground">
          El token permanece solo en la memoria de esta pestaña. No lo compartas ni lo pegues en chats.
        </p>
      </form>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">
          <p className="font-semibold">No se pudo medir el feed</p>
          <p className="mt-1">{error}</p>
          {result?.detail && <p className="mt-1 text-muted-foreground">{result.detail}</p>}
        </div>
      )}

      {result && (
        <section className="space-y-4">
          <div className="rounded-lg border border-border p-4">
            <p className="font-semibold">Captura recibida</p>
            <p className="mt-1 text-sm text-muted-foreground">HTTP {result.httpStatus} · {(result.bytes ?? 0).toLocaleString()} bytes · {result.elapsedMs} ms</p>
            <p className="text-xs text-muted-foreground">Consultada: {result.checkedAt}</p>
            <p className="text-xs text-muted-foreground">Marca de tiempo del feed: {result.feedTimestamp ?? "No disponible"}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric label="Entidades" value={result.entityCount} />
            <Metric label="Vehículos" value={result.vehicleEntityCount} />
            <Metric label="Con coordenadas" value={result.positionedVehicleCount} />
            <Metric label="GPS ≤ 30 s" value={result.under30SecondsPercent == null ? "N/D" : `${result.under30SecondsPercent}%`} />
            <Metric label="GPS ≤ 90 s" value={result.under90SecondsPercent == null ? "N/D" : `${result.under90SecondsPercent}%`} />
            <Metric label="Sin timestamp" value={result.missingPositionTimestampCount} />
          </div>

          {result.ageSeconds && (
            <div className="rounded-lg border border-border p-4 text-sm">
              <h2 className="font-semibold">Antigüedad de posiciones GPS</h2>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Mínima" value={`${result.ageSeconds.min} s`} />
                <Metric label="Mediana" value={`${result.ageSeconds.median} s`} />
                <Metric label="Percentil 95" value={`${result.ageSeconds.p95} s`} />
                <Metric label="Máxima" value={`${result.ageSeconds.max} s`} />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h2 className="font-semibold">Muestra de vehículos</h2>
            {result.samples?.map((vehicle, index) => (
              <article key={vehicle.id ?? index} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-semibold">{vehicle.label ?? vehicle.id ?? "Vehículo sin identificador"}</p>
                <p className="text-muted-foreground">Placa: {vehicle.licensePlate ?? "No publicada"} · Ruta ID: {vehicle.routeId ?? "No publicada"}</p>
                <p>Antigüedad GPS: {vehicle.ageSeconds == null ? "Sin timestamp" : `${vehicle.ageSeconds} segundos`}</p>
                <p className="break-all font-mono text-xs text-muted-foreground">{vehicle.latitude ?? "?"}, {vehicle.longitude ?? "?"}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value ?? "N/D"}</p>
    </div>
  );
}
