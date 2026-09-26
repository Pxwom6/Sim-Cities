/**
 * JSON-safe encoding for sim state: typed arrays become base64 strings and Maps become entry lists.
 * `canonicalStringify` sorts object keys so hashes don't depend on property insertion order.
 */
type Typed = Uint8Array | Int32Array | Uint16Array | Float32Array | Float64Array | Int16Array | Uint32Array;
const TYPED: Record<string, new (buf: ArrayBuffer) => Typed> = {
  u8: Uint8Array,
  i32: Int32Array,
  u16: Uint16Array,
  f32: Float32Array,
  f64: Float64Array,
  i16: Int16Array,
  u32: Uint32Array,
};

function typedTag(v: Typed): string {
  if (v instanceof Uint8Array) return 'u8';
  if (v instanceof Int32Array) return 'i32';
  if (v instanceof Uint16Array) return 'u16';
  if (v instanceof Float32Array) return 'f32';
  if (v instanceof Float64Array) return 'f64';
  if (v instanceof Int16Array) return 'i16';
  return 'u32';
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(128);
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i;

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const n = (a << 16) | (b << 8) | c;
    chunk += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    chunk += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=';
    chunk += i + 2 < bytes.length ? B64[n & 63]! : '=';
    if (chunk.length > 8192) {
      parts.push(chunk);
      chunk = '';
    }
  }
  parts.push(chunk);
  return parts.join('');
}

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_LOOKUP[clean.charCodeAt(i)]!;
    const b = B64_LOOKUP[clean.charCodeAt(i + 1)]!;
    const c = i + 2 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 2)]! : 0;
    const d = i + 3 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 3)]! : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

export function encodeValue(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (ArrayBuffer.isView(v)) {
    const t = v as Typed;
    const bytes = new Uint8Array(t.buffer, t.byteOffset, t.byteLength);
    return { $t: typedTag(t), d: bytesToBase64(bytes) };
  }
  if (v instanceof Map) return { $m: [...v.entries()].map(([k, val]) => [k, encodeValue(val)]) };
  if (Array.isArray(v)) return v.map(encodeValue);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val !== undefined) out[k] = encodeValue(val);
  }
  return out;
}

export function decodeValue(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(decodeValue);
  const o = v as Record<string, unknown>;
  if (typeof o.$t === 'string' && typeof o.d === 'string') {
    const bytes = base64ToBytes(o.d);
    const Ctor = TYPED[o.$t]!;
    const buf = new ArrayBuffer(bytes.length);
    new Uint8Array(buf).set(bytes);
    return new Ctor(buf);
  }
  if (Array.isArray(o.$m)) {
    return new Map((o.$m as [unknown, unknown][]).map(([k, val]) => [k, decodeValue(val)]));
  }
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(o)) out[k] = decodeValue(val);
  return out;
}

/** JSON.stringify with sorted object keys (applied to already-encoded values). */
export function canonicalStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonicalStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(o[k])}`).join(',')}}`;
}
