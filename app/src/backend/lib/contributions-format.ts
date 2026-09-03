/**
 * `drogna-contributions-v1` (feature 124): how an analysis cycle's per-source
 * contributions are written into a coverage holding and read back.
 *
 * One function each way, in one file, for the reason the snapshot codec gives: an
 * encoder and a decoder that live apart drift apart, and the drift would be silent —
 * a mis-cut section still yields *some* numbers.
 *
 * Layout, stated again in the header itself so the bytes are readable from the holding
 * alone (analysis-contributions.schema.json, `$defs/header`):
 *
 *   u32le  header byte length, a multiple of four
 *   utf-8  the header, padded with spaces to that length
 *   u32[cells] cell; f32[cells] observation_weight; f32[cells] remainder;
 *   f32[cells] background_error_std; u32[cells+1] offsets;
 *   u32[entries] source; f32[entries] contribution;
 *   f32[entries] horizontal_km; f32[entries] vertical_m
 *
 * Why not the same content as JSON: measured on the shipped configuration a cycle's
 * rows are tens of thousands of entries, and the cost this feature accepts is storage
 * for the life of the run — not several times that much of it. Why not a dense field
 * per source through `drogna-f32-v1`: sources × 46,080 cells × 4 bytes a cycle, which
 * is what the sparse holding exists to avoid. Padding the header to four bytes is what
 * lets every section be a plain typed array over the buffer; the decoder copies each
 * section anyway, so a caller's unaligned view is never a fault.
 *
 * Element order within a typed array is the platform's, which is the same assumption
 * every `drogna-f32-v1` reader in this tree already makes.
 */
import type { AnalysisContributionsHeader } from '../../generated/types.js';

export const CONTRIBUTIONS_FORMAT = 'drogna-contributions-v1' as const;

/** The rows of the holding: compressed by cell, the i-th cell's entries at offsets[i]..offsets[i+1]. */
export interface ContributionRows {
  readonly cells: Uint32Array;
  readonly weight: Float32Array;
  readonly remainder: Float32Array;
  readonly backgroundErrorStd: Float32Array;
  readonly offsets: Uint32Array;
  readonly entrySource: Uint32Array;
  readonly entryContribution: Float32Array;
  readonly entryHorizontalKm: Float32Array;
  readonly entryVerticalM: Float32Array;
}

export interface DecodedContributions {
  readonly header: AnalysisContributionsHeader;
  readonly rows: ContributionRows;
}

const WORD = 4;

function sectionsOf(rows: ContributionRows): (Uint32Array | Float32Array)[] {
  return [
    rows.cells,
    rows.weight,
    rows.remainder,
    rows.backgroundErrorStd,
    rows.offsets,
    rows.entrySource,
    rows.entryContribution,
    rows.entryHorizontalKm,
    rows.entryVerticalM,
  ];
}

export function encodeContributions(header: AnalysisContributionsHeader, rows: ContributionRows): Uint8Array {
  const cells = rows.cells.length;
  const entries = rows.entrySource.length;
  // The header's counts are what the decoder cuts on, so a header that disagrees with
  // the rows it fronts is refused here rather than read back as something else.
  if (header.cells !== cells) throw new Error(`the header claims ${header.cells} cells and the rows hold ${cells}`);
  if (header.entries !== entries) throw new Error(`the header claims ${header.entries} entries and the rows hold ${entries}`);
  for (const [name, array, wanted] of [
    ['observation_weight', rows.weight, cells],
    ['remainder', rows.remainder, cells],
    ['background_error_std', rows.backgroundErrorStd, cells],
    ['offsets', rows.offsets, cells + 1],
    ['contribution', rows.entryContribution, entries],
    ['horizontal_km', rows.entryHorizontalKm, entries],
    ['vertical_m', rows.entryVerticalM, entries],
  ] as const) {
    if (array.length !== wanted) throw new Error(`section ${name} holds ${array.length} elements where ${wanted} are declared`);
  }
  if (rows.offsets[cells] !== entries) throw new Error(`offsets end at ${rows.offsets[cells]} where ${entries} entries are declared`);

  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(JSON.stringify(header));
  const padded = Math.ceil(headerBytes.byteLength / WORD) * WORD;
  const sections = sectionsOf(rows);
  let total = WORD + padded;
  for (const section of sections) total += section.byteLength;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, padded, true);
  out.set(headerBytes, WORD);
  out.fill(0x20, WORD + headerBytes.byteLength, WORD + padded);
  let at = WORD + padded;
  for (const section of sections) {
    out.set(new Uint8Array(section.buffer, section.byteOffset, section.byteLength), at);
    at += section.byteLength;
  }
  return out;
}

/**
 * The bytes back into rows. Every section is copied into a fresh, aligned array, and a
 * buffer that cannot be cut as its header says is refused whole rather than read as a
 * holding with some rows missing.
 */
export function decodeContributions(bytes: Uint8Array): DecodedContributions {
  if (bytes.byteLength < WORD) throw new Error(`a contributions holding of ${bytes.byteLength} bytes has no header length`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = view.getUint32(0, true);
  if (headerLength % WORD !== 0 || WORD + headerLength > bytes.byteLength) {
    throw new Error(`a header of ${headerLength} bytes does not fit a holding of ${bytes.byteLength}`);
  }
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(WORD, WORD + headerLength)).trimEnd()) as AnalysisContributionsHeader;
  if (header.format !== CONTRIBUTIONS_FORMAT) throw new Error(`the header names format '${header.format}', not ${CONTRIBUTIONS_FORMAT}`);
  const cells = header.cells;
  const entries = header.entries;
  const lengths = [cells, cells, cells, cells, cells + 1, entries, entries, entries, entries];
  const expected = WORD + headerLength + lengths.reduce((sum, length) => sum + length * WORD, 0);
  if (expected !== bytes.byteLength) {
    throw new Error(`the header declares ${cells} cells and ${entries} entries, which is ${expected} bytes; the holding is ${bytes.byteLength}`);
  }
  let at = bytes.byteOffset + WORD + headerLength;
  const cut = <T extends Uint32Array | Float32Array>(make: (buffer: ArrayBuffer) => T, length: number): T => {
    const section = make((bytes.buffer as ArrayBuffer).slice(at, at + length * WORD));
    at += length * WORD;
    return section;
  };
  const u32 = (buffer: ArrayBuffer) => new Uint32Array(buffer);
  const f32 = (buffer: ArrayBuffer) => new Float32Array(buffer);
  const rows: ContributionRows = {
    cells: cut(u32, cells),
    weight: cut(f32, cells),
    remainder: cut(f32, cells),
    backgroundErrorStd: cut(f32, cells),
    offsets: cut(u32, cells + 1),
    entrySource: cut(u32, entries),
    entryContribution: cut(f32, entries),
    entryHorizontalKm: cut(f32, entries),
    entryVerticalM: cut(f32, entries),
  };
  return { header, rows };
}
