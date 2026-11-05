import "server-only";

type Field = { number: number; wire: number; value: bigint | number | Uint8Array };

function readVarint(bytes: Uint8Array, state: { offset: number }): bigint {
  let value = 0n;
  let shift = 0n;
  while (state.offset < bytes.length && shift < 70n) {
    const byte = bytes[state.offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value;
    shift += 7n;
  }
  throw new Error("Invalid protobuf varint");
}

function readFields(bytes: Uint8Array): Field[] {
  const state = { offset: 0 };
  const result: Field[] = [];
  while (state.offset < bytes.length) {
    const key = Number(readVarint(bytes, state));
    const number = key >>> 3;
    const wire = key & 7;
    if (number === 0) throw new Error("Invalid protobuf field number");
    if (wire === 0) {
      result.push({ number, wire, value: readVarint(bytes, state) });
    } else if (wire === 1) {
      if (state.offset + 8 > bytes.length) throw new Error("Truncated protobuf fixed64");
      const view = new DataView(bytes.buffer, bytes.byteOffset + state.offset, 8);
      result.push({ number, wire, value: view.getFloat64(0, true) });
      state.offset += 8;
    } else if (wire === 2) {
      const length = Number(readVarint(bytes, state));
      if (!Number.isSafeInteger(length) || length < 0 || state.offset + length > bytes.length) {
        throw new Error("Invalid protobuf length");
      }
      result.push({ number, wire, value: bytes.subarray(state.offset, state.offset + length) });
      state.offset += length;
    } else if (wire === 5) {
      if (state.offset + 4 > bytes.length) throw new Error("Truncated protobuf fixed32");
      const view = new DataView(bytes.buffer, bytes.byteOffset + state.offset, 4);
      result.push({ number, wire, value: view.getFloat32(0, true) });
      state.offset += 4;
    } else {
      throw new Error(`Unsupported protobuf wire type: ${wire}`);
    }
  }
  return result;
}

function nested(fields: Field[], number: number): Field[] {
  const value = fields.find((field) => field.number === number && field.wire === 2)?.value;
  return value instanceof Uint8Array ? readFields(value) : [];
}

function stringField(fields: Field[], number: number): string | null {
  const value = fields.find((field) => field.number === number && field.wire === 2)?.value;
  return value instanceof Uint8Array ? new TextDecoder().decode(value) : null;
}

function numberField(fields: Field[], number: number): number | null {
  const value = fields.find((field) => field.number === number)?.value;
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" ? value : null;
}

function isoFromSeconds(value: number | null): string | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export interface GtfsVehicleSample {
  id: string | null;
  label: string | null;
  licensePlate: string | null;
  routeId: string | null;
  latitude: number | null;
  longitude: number | null;
  speedMps: number | null;
  bearing: number | null;
  positionTimestamp: string | null;
  ageSeconds: number | null;
}

export interface GtfsFeedDiagnostics {
  feedTimestamp: string | null;
  entityCount: number;
  vehicleEntityCount: number;
  positionedVehicleCount: number;
  missingPositionTimestampCount: number;
  futureTimestampCount: number;
  under30SecondsPercent: number | null;
  under90SecondsPercent: number | null;
  ageSeconds: { min: number; median: number; p95: number; max: number } | null;
  samples: GtfsVehicleSample[];
}

export function decodeVehiclePositions(buffer: Uint8Array, nowMs = Date.now()): GtfsFeedDiagnostics {
  const feed = readFields(buffer);
  const header = nested(feed, 1);
  const feedTimestamp = isoFromSeconds(numberField(header, 3));
  const entities = feed.filter((field) => field.number === 2 && field.wire === 2);
  const samples: GtfsVehicleSample[] = [];
  const ages: number[] = [];
  let vehicleEntityCount = 0;
  let positionedVehicleCount = 0;
  let missingPositionTimestampCount = 0;
  let futureTimestampCount = 0;

  for (const entityField of entities) {
    if (!(entityField.value instanceof Uint8Array)) continue;
    const entity = readFields(entityField.value);
    const vehicleFields = nested(entity, 4);
    if (vehicleFields.length === 0) continue;
    vehicleEntityCount++;

    const position = nested(vehicleFields, 2);
    const descriptor = nested(vehicleFields, 8);
    const trip = nested(vehicleFields, 1);
    const latitude = numberField(position, 1);
    const longitude = numberField(position, 2);
    const hasPosition = latitude !== null && longitude !== null;
    if (hasPosition) positionedVehicleCount++;

    const timestamp = isoFromSeconds(numberField(vehicleFields, 5));
    const ageSeconds = timestamp ? Math.round((nowMs - Date.parse(timestamp)) / 1000) : null;
    if (ageSeconds === null) missingPositionTimestampCount++;
    else if (ageSeconds < 0) futureTimestampCount++;
    else ages.push(ageSeconds);

    if (samples.length < 8) {
      samples.push({
        id: stringField(descriptor, 1),
        label: stringField(descriptor, 2),
        licensePlate: stringField(descriptor, 3),
        routeId: stringField(trip, 5),
        latitude,
        longitude,
        speedMps: numberField(position, 5),
        bearing: numberField(position, 3),
        positionTimestamp: timestamp,
        ageSeconds,
      });
    }
  }

  ages.sort((a, b) => a - b);
  const percentile = (p: number) => ages.length ? ages[Math.min(ages.length - 1, Math.ceil(p * ages.length) - 1)] : null;
  const min = ages.length ? ages[0] : null;
  const max = ages.length ? ages[ages.length - 1] : null;
  const median = percentile(0.5);
  const p95 = percentile(0.95);

  return {
    feedTimestamp,
    entityCount: entities.length,
    vehicleEntityCount,
    positionedVehicleCount,
    missingPositionTimestampCount,
    futureTimestampCount,
    under30SecondsPercent: ages.length ? Math.round((ages.filter((age) => age <= 30).length / ages.length) * 1000) / 10 : null,
    under90SecondsPercent: ages.length ? Math.round((ages.filter((age) => age <= 90).length / ages.length) * 1000) / 10 : null,
    ageSeconds: min === null || max === null || median === null || p95 === null
      ? null
      : { min, median, p95, max },
    samples,
  };
}
