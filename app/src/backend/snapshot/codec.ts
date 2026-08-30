/**
 * The seed-data snapshot format (feature 118, ADR-0040): how a run's coverage holdings
 * are written to a build artefact and read back.
 *
 * One function each way, in one file, because an encoder and a decoder that live apart
 * drift apart — and the drift here would be silent, since a mis-cut body still yields
 * *some* bytes and the coverage store would refuse them with a digest mismatch naming
 * neither side. The round trip is asserted by test over the shipped artefacts.
 *
 * Layout, `drogna-snapshot-1`, gzipped whole:
 *
 *   u32le  header length
 *   utf-8  the header, of snapshot.schema.json shape
 *   bytes  each holding's field, byte-plane shuffled, in the header's order
 *
 * **Byte-plane shuffling** is the one thing here that is not obvious. A field is
 * float32, and gzip sees it as a stream of four-byte groups whose first byte is nearly
 * constant across the whole grid (the exponent of a temperature is one of two or three
 * values) and whose last is close to noise. Interleaved, the constant is never more than
 * three bytes from the noise and the compressor's window is spent on the mixture.
 * Deinterleaved into planes it compresses each for what it is. Measured on the shipped
 * conditions: the archive goes from 63:1 to 158:1 and the now-cast from 2.1:1 to 3.5:1,
 * for about a line of arithmetic. It is exactly lossless — a permutation of the bytes —
 * so the digest the coverage store checks is unaffected, which is the property that
 * matters and the reason this is safe to do at all.
 *
 * `CompressionStream` rather than a library: it is in the browser and in Node, so the
 * build script and the page run the same code, and the artefact cannot be produced by
 * one implementation and read by another.
 */
import type { CoverageHolding, Snapshot } from '../../generated/types.js';
import type { StagedHolding } from '../coverage-store/store.js';

export const SNAPSHOT_FORMAT = 'drogna-snapshot-1';

/** float32: the width the planes are cut on. */
const PLANE_WIDTH = 4;

/** A permutation, and its own inverse only when the length is a multiple of the width. */
function shuffle(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  const groups = Math.floor(bytes.length / PLANE_WIDTH);
  let at = 0;
  for (let plane = 0; plane < PLANE_WIDTH; plane += 1) {
    for (let group = 0; group < groups; group += 1) out[at++] = bytes[group * PLANE_WIDTH + plane];
  }
  // A tail shorter than one group is copied straight through. Field byte lengths are
  // always a whole number of float32s, so this never runs on a shipped artefact; it is
  // here so the permutation is total rather than only total on the inputs we happen to
  // have, which is the difference between a function and a coincidence.
  for (let i = groups * PLANE_WIDTH; i < bytes.length; i += 1) out[at++] = bytes[i];
  return out;
}

function unshuffle(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  const groups = Math.floor(bytes.length / PLANE_WIDTH);
  let at = 0;
  for (let plane = 0; plane < PLANE_WIDTH; plane += 1) {
    for (let group = 0; group < groups; group += 1) out[group * PLANE_WIDTH + plane] = bytes[at++];
  }
  for (let i = groups * PLANE_WIDTH; i < bytes.length; i += 1) out[i] = bytes[at++];
  return out;
}

async function through(bytes: Uint8Array, transform: 'gzip' | 'gunzip'): Promise<Uint8Array> {
  // A fresh, plainly-backed copy. `Uint8Array` in TypeScript 5.7 is generic over its
  // buffer, and one that might be over a SharedArrayBuffer is not a `BufferSource` —
  // which is the writer's parameter. Copying is a few hundred microseconds on the
  // largest artefact and removes the question.
  const source = new Uint8Array(bytes);
  const stream =
    transform === 'gzip' ? new CompressionStream('gzip') : new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  // The write side is driven without awaiting it here — the read loop below is what
  // consumes the output, and awaiting the write first would deadlock on a stream whose
  // internal queue is full. But its promise MUST have a handler: when the input is not a
  // gzip stream the writable errors, and a floating rejection is an unhandled one. That
  // took the whole gates runner down with `TypeError` and no message, in the exact case
  // this is all here to handle — a damaged artefact — and in the browser it would have
  // escaped the fetch's own try/catch and left the page dead rather than falling back to
  // authoring live. The fault is reported by the read side, in words, so it is swallowed
  // here rather than reported twice.
  const writing = writer
    .write(source)
    .then(() => writer.close())
    .catch(() => undefined);
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as Uint8Array);
    }
  } catch (fault) {
    await writing;
    throw new Error(
      `the ${transform === 'gzip' ? 'compression' : 'decompression'} stream refused these bytes: ` +
        `${(fault as Error).message || (fault as { code?: string }).code || 'they are not a gzip stream'}`,
    );
  }
  await writing;
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

export interface SnapshotContents {
  readonly header: Snapshot;
  /** Ready to hand to the coverage store's one write path, in publication order. */
  readonly holdings: StagedHolding[];
}

export async function encodeSnapshot(
  header: Omit<Snapshot, 'holdings'> & { holdings?: never },
  holdings: readonly { descriptor: CoverageHolding; bytes: Uint8Array }[],
): Promise<Uint8Array> {
  const document: Snapshot = {
    ...header,
    holdings: holdings.map((holding) => ({
      descriptor: holding.descriptor,
      byte_length: holding.bytes.byteLength,
    })),
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(document));
  const bodyLength = holdings.reduce((sum, holding) => sum + holding.bytes.byteLength, 0);
  const plain = new Uint8Array(4 + headerBytes.byteLength + bodyLength);
  new DataView(plain.buffer as ArrayBuffer).setUint32(0, headerBytes.byteLength, true);
  plain.set(headerBytes, 4);
  let at = 4 + headerBytes.byteLength;
  for (const holding of holdings) {
    plain.set(shuffle(holding.bytes), at);
    at += holding.bytes.byteLength;
  }
  return through(plain, 'gzip');
}

/**
 * Read an artefact back. Throws rather than returning a partial reading: a snapshot that
 * cannot be cut into its holdings is not a snapshot with some holdings missing, and a
 * caller handed one would publish a truncated ocean.
 *
 * The digests are NOT checked here. That is deliberate and is the whole point of the
 * design: the bytes go to the coverage store's own `publish`, which hashes them against
 * the descriptor exactly as it does for a live publication, so a corrupted artefact is
 * refused by the same check and in the same words as a corrupted generator. A second
 * digest check here would be a second implementation of the guard, free to disagree.
 */
export async function decodeSnapshot(compressed: Uint8Array): Promise<SnapshotContents> {
  const plain = await through(compressed, 'gunzip');
  if (plain.byteLength < 4) throw new Error('snapshot is too short to carry a header length');
  const headerLength = new DataView(plain.buffer as ArrayBuffer, plain.byteOffset, plain.byteLength).getUint32(0, true);
  if (4 + headerLength > plain.byteLength) {
    throw new Error(`snapshot claims a ${headerLength}-byte header in ${plain.byteLength} bytes`);
  }
  const header = JSON.parse(
    new TextDecoder().decode(plain.subarray(4, 4 + headerLength)),
  ) as Snapshot;
  if (header.format !== SNAPSHOT_FORMAT) {
    throw new Error(`snapshot is '${header.format}', this build reads '${SNAPSHOT_FORMAT}'`);
  }
  const holdings: StagedHolding[] = [];
  let at = 4 + headerLength;
  for (const entry of header.holdings) {
    const end = at + entry.byte_length;
    if (end > plain.byteLength) {
      throw new Error(
        `snapshot body ends after ${plain.byteLength - at} of the ${entry.byte_length} bytes ` +
          `'${entry.descriptor.holding_id}' declares`,
      );
    }
    holdings.push({ descriptor: entry.descriptor, bytes: unshuffle(plain.subarray(at, end)) });
    at = end;
  }
  if (at !== plain.byteLength) {
    throw new Error(`snapshot body carries ${plain.byteLength - at} bytes no holding claims`);
  }
  return { header, holdings };
}
