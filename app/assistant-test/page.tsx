"use client";

import { useState } from "react";

type LookupResult = {
  ok?: boolean;
  error?: { code?: string; message?: string };
  query?: string;
  asOf?: string | null;
  fleetTotal?: number;
  count?: number;
  returned?: number;
  matches?: Array<{
    id: string;
    plate: string | null;
    label: string | null;
    routeCode: string | null;
    routeName: string | null;
    lastReportedStop: string | null;
    latitude: number;
    longitude: number;
    reportedAt: string | null;
    reportAgeSeconds: number | null;
  }>;
  note?: string;
};

export default function AssistantTestPage() {
  const [token, setToken] = useState("");
  const [query, setQuery] = useState("K23");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(
        `/api/assistant/fleet?q=${encodeURIComponent(query)}&limit=20`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const data = (await response.json()) as LookupResult;
      if (!response.ok) {
        setError(data.error?.message ?? `Error HTTP ${response.status}`);
      } else {
        setResult(data);
      }
    } catch {
      setError("No fue posible conectar con el puente. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-5 py-12 text-foreground">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Croma · TransMilenio Live</p>
        <h1 className="text-3xl font-semibold tracking-tight">Prueba del asistente</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Consulta buses por placa, identificador, ruta o última estación reportada.
          Esta página envía tu token directamente al puente protegido.
        </p>
      </div>

      <form onSubmit={search} className="flex flex-col gap-4 rounded-xl border border-border p-5">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Token de acceso
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
            placeholder="Pega aquí TRANSIT_BRIDGE_TOKEN"
            className="h-11 rounded-md border border-border bg-background px-3 font-mono text-sm"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          ¿Qué quieres buscar?
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            required
            maxLength={80}
            placeholder="Ej. K23, placa o estación"
            className="h-11 rounded-md border border-border bg-background px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !token.trim() || !query.trim()}
          className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Consultando Croma…" : "Buscar buses"}
        </button>
        <p className="text-xs leading-5 text-muted-foreground">
          El token solo se mantiene en la memoria de esta pestaña mientras la usas; no se guarda en el navegador ni se muestra en los resultados.
          No lo compartas ni lo pegues en chats públicos.
        </p>
      </form>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">
          <p className="font-semibold">No se pudo completar la consulta</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {result && (
        <section className="space-y-4">
          <div className="rounded-lg border border-border p-4 text-sm">
            <p className="font-semibold">Consulta completada</p>
            <p className="mt-1 text-muted-foreground">
              {result.count ?? 0} coincidencias · {result.returned ?? 0} mostradas · flota total: {result.fleetTotal ?? "no disponible"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Corte de datos: {result.asOf ?? "sin marca de tiempo"}</p>
          </div>
          {result.matches?.map((bus) => (
            <article key={bus.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{bus.label ?? bus.id}</h2>
                <span className="text-sm text-muted-foreground">{bus.plate ?? "Placa no disponible"}</span>
              </div>
              <p className="mt-2 text-sm">Ruta: {bus.routeCode ?? bus.routeName ?? "No disponible"}</p>
              <p className="text-sm">Última estación reportada: {bus.lastReportedStop ?? "No disponible"}</p>
              <p className="text-sm">Último reporte: {bus.reportedAt ?? "No disponible"}</p>
              <p className="text-sm">Antigüedad del reporte: {bus.reportAgeSeconds == null ? "No disponible" : `${bus.reportAgeSeconds} segundos`}</p>
              <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                Coordenadas del último reporte: {bus.latitude}, {bus.longitude}
              </p>
            </article>
          ))}
          {result.count === 0 && <p className="text-sm text-muted-foreground">No hubo coincidencias para esa búsqueda.</p>}
          {result.note && <p className="text-xs leading-5 text-muted-foreground">{result.note}</p>}
        </section>
      )}
    </main>
  );
}
