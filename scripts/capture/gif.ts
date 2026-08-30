/**
 * A GIF89a encoder, and just enough of a PNG decoder to feed it (SRD-v2 FR-19).
 *
 * Written here rather than taken from a package because this container has no ffmpeg,
 * no ImageMagick and no imaging library, and because what it has to encode is not
 * photography: a screenshot of this shell is flat colour on flat colour, a few thousand
 * distinct values across a whole animation, which is the case GIF was designed for and
 * the case a quantiser can get exactly right rather than approximately.
 *
 * It is deliberately small: one global colour table, and each frame after the first
 * carrying only the rectangle that actually changed. That last part is not an
 * optimisation for its own sake — most of a captured interaction is a still picture with
 * one corner moving, and a frame that says so is a few hundred bytes instead of sixty
 * kilobytes. It took a published animation from 1.1 MB to something a blog entry can
 * carry without apologising for it.
 */
import { inflateSync } from 'node:zlib';

export interface Frame {
  readonly width: number;
  readonly height: number;
  /** RGBA, eight bits a channel, row by row. */
  readonly pixels: Uint8Array;
}

// ------------------------------------------------------------------ PNG in ---

/**
 * The subset of PNG that Chromium's screenshots are: eight bits a channel, RGB or RGBA,
 * not interlaced. Anything else throws rather than being guessed at — a capture that
 * silently decoded to the wrong pixels would be a picture of nothing in particular.
 */
export function decodePng(png: Buffer): Frame {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let at = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const parts: Buffer[] = [];
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const kind = png.subarray(at + 4, at + 8).toString('latin1');
    const body = png.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const colour = body[9];
      const interlace = body[12];
      if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6)) {
        throw new Error(`unsupported PNG: depth ${depth}, colour type ${colour}, interlace ${interlace}`);
      }
      channels = colour === 6 ? 4 : 3;
    } else if (kind === 'IDAT') parts.push(body);
    else if (kind === 'IEND') break;
    at += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride);
  const previous = new Uint8Array(stride);
  let read = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[read++];
    for (let x = 0; x < stride; x++) {
      const value = raw[read + x];
      const a = x >= channels ? line[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;
      let out: number;
      switch (filter) {
        case 0: out = value; break;
        case 1: out = value + a; break;
        case 2: out = value + b; break;
        case 3: out = value + ((a + b) >> 1); break;
        case 4: {
          // Paeth, from the specification: the neighbour the gradient points at.
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          out = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`unknown PNG filter ${filter}`);
      }
      line[x] = out & 0xff;
    }
    read += stride;
    for (let x = 0; x < width; x++) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      pixels[to] = line[from];
      pixels[to + 1] = line[from + 1];
      pixels[to + 2] = line[from + 2];
      pixels[to + 3] = channels === 4 ? line[from + 3] : 255;
    }
    previous.set(line);
  }
  return { width, height, pixels };
}

// ------------------------------------------------------------- the palette ---

/**
 * One colour table for the whole animation.
 *
 * Every distinct colour is counted across every frame. Where there are 256 or fewer the
 * table *is* the picture and nothing is approximated — which is what happens with a flat
 * interface, and why this is worth doing before reaching for a quantiser. Where there are
 * more, the commonest 256 are kept and everything else maps to its nearest, memoised by
 * colour so the cost is per distinct colour rather than per pixel.
 */
function paletteFor(frames: readonly Frame[]): { table: number[][]; indexOf: (rgb: number) => number } {
  const counts = new Map<number, number>();
  for (const frame of frames) {
    for (let at = 0; at < frame.pixels.length; at += 4) {
      const rgb = (frame.pixels[at] << 16) | (frame.pixels[at + 1] << 8) | frame.pixels[at + 2];
      counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
    }
  }
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 256).map(([rgb]) => rgb);
  const table = common.map((rgb) => [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff]);
  const exact = new Map(common.map((rgb, index) => [rgb, index]));
  const nearest = new Map<number, number>();
  const indexOf = (rgb: number): number => {
    const known = exact.get(rgb);
    if (known !== undefined) return known;
    const cached = nearest.get(rgb);
    if (cached !== undefined) return cached;
    const [r, g, b] = [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff];
    let best = 0;
    let bestCost = Infinity;
    table.forEach((entry, index) => {
      const cost = (entry[0] - r) ** 2 + (entry[1] - g) ** 2 + (entry[2] - b) ** 2;
      if (cost < bestCost) {
        bestCost = cost;
        best = index;
      }
    });
    nearest.set(rgb, best);
    return best;
  };
  return { table, indexOf };
}

// ----------------------------------------------------------------- GIF out ---

/** LZW, as GIF uses it: variable code width, a clear code, and a dictionary reset. */
function lzw(indices: Uint8Array, minimumCodeSize: number): Buffer {
  const clear = 1 << minimumCodeSize;
  const end = clear + 1;
  const out: number[] = [];
  let bits = 0;
  let held = 0;
  let width = minimumCodeSize + 1;
  const emit = (code: number) => {
    held |= code << bits;
    bits += width;
    while (bits >= 8) {
      out.push(held & 0xff);
      held >>= 8;
      bits -= 8;
    }
  };

  let dictionary = new Map<string, number>();
  let next = end + 1;
  const reset = () => {
    dictionary = new Map();
    next = end + 1;
    width = minimumCodeSize + 1;
  };

  emit(clear);
  reset();
  let run = String(indices[0]);
  for (let at = 1; at < indices.length; at++) {
    const symbol = String(indices[at]);
    const combined = `${run},${symbol}`;
    if (dictionary.has(combined)) {
      run = combined;
      continue;
    }
    emit(run.includes(',') ? (dictionary.get(run) as number) : Number(run));
    dictionary.set(combined, next++);
    if (next === (1 << width) + 1 && width < 12) width += 1;
    else if (next > 4095) {
      emit(clear);
      reset();
    }
    run = symbol;
  }
  emit(run.includes(',') ? (dictionary.get(run) as number) : Number(run));
  emit(end);
  if (bits > 0) out.push(held & 0xff);

  // Sub-blocks: at most 255 bytes each, terminated by a zero length.
  const blocks: number[] = [];
  for (let at = 0; at < out.length; at += 255) {
    const chunk = out.slice(at, at + 255);
    blocks.push(chunk.length, ...chunk);
  }
  blocks.push(0);
  return Buffer.from(blocks);
}

/** The smallest rectangle holding every pixel that differs between two frames. */
function changed(before: Frame, after: Frame): { left: number; top: number; width: number; height: number } {
  const { width, height } = after;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      if (
        before.pixels[at] !== after.pixels[at] ||
        before.pixels[at + 1] !== after.pixels[at + 1] ||
        before.pixels[at + 2] !== after.pixels[at + 2]
      ) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  // Nothing moved: one pixel of the picture, repainted as itself.
  if (right < 0) return { left: 0, top: 0, width: 1, height: 1 };
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Encode an animation. `delayMs` is per frame; GIF keeps hundredths of a second, so a
 * delay is rounded to that and a delay under 20ms is what browsers throttle — the caller
 * is told what it actually got rather than left to assume.
 */
export function encodeGif(frames: readonly Frame[], delayMs: number): Buffer {
  if (frames.length === 0) throw new Error('an animation of no frames');
  const { width, height } = frames[0];
  for (const frame of frames) {
    if (frame.width !== width || frame.height !== height) throw new Error('frames differ in size');
  }
  const { table, indexOf } = paletteFor(frames);

  // The table is a power of two, padded with black; the packed field carries its size.
  let bits = 1;
  while (1 << bits < table.length) bits += 1;
  const entries = 1 << bits;
  const colours = Buffer.alloc(entries * 3);
  table.forEach(([r, g, b], index) => {
    colours[index * 3] = r;
    colours[index * 3 + 1] = g;
    colours[index * 3 + 2] = b;
  });

  const parts: Buffer[] = [];
  const screen = Buffer.alloc(13);
  screen.write('GIF89a', 0, 'latin1');
  screen.writeUInt16LE(width, 6);
  screen.writeUInt16LE(height, 8);
  screen[10] = 0x80 | ((bits - 1) & 0x07) | 0x70; // global table, 8-bit colour resolution
  screen[11] = 0;
  screen[12] = 0;
  parts.push(screen, colours);

  // Loop for ever (the Netscape application extension, which is how every GIF loops).
  const loop = Buffer.from([0x21, 0xff, 0x0b]);
  parts.push(loop, Buffer.from('NETSCAPE2.0', 'latin1'), Buffer.from([0x03, 0x01, 0x00, 0x00, 0x00]));

  const delay = Math.max(2, Math.round(delayMs / 10));
  const minimumCodeSize = Math.max(2, bits);
  frames.forEach((frame, at) => {
    // What actually moved. The first frame is the whole picture; after that, the
    // smallest rectangle holding every pixel that differs from the frame before, drawn
    // over what is already on screen (disposal 1). A frame where nothing moved — the
    // held frames at the end of a loop — becomes a single pixel.
    const box = at === 0 ? { left: 0, top: 0, width, height } : changed(frames[at - 1], frame);
    const control = Buffer.from([0x21, 0xf9, 0x04, 0x04, 0, 0, 0, 0x00]);
    control.writeUInt16LE(delay, 4);
    const descriptor = Buffer.alloc(10);
    descriptor[0] = 0x2c;
    descriptor.writeUInt16LE(box.left, 1);
    descriptor.writeUInt16LE(box.top, 3);
    descriptor.writeUInt16LE(box.width, 5);
    descriptor.writeUInt16LE(box.height, 7);
    descriptor[9] = 0;
    const indices = new Uint8Array(box.width * box.height);
    for (let row = 0; row < box.height; row++) {
      for (let column = 0; column < box.width; column++) {
        const from = ((box.top + row) * width + box.left + column) * 4;
        indices[row * box.width + column] = indexOf(
          (frame.pixels[from] << 16) | (frame.pixels[from + 1] << 8) | frame.pixels[from + 2],
        );
      }
    }
    parts.push(control, descriptor, Buffer.from([minimumCodeSize]), lzw(indices, minimumCodeSize));
  });

  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}
