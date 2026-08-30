/**
 * The rolling windows the faces draw (SRD-v2 FR-58).
 *
 * Bounded, in memory, discarded on reload, never persisted and never served: a window
 * that outlived the page would be a second store, and Version 2 persists nothing
 * between visits by design. The bound comes from the shell's configuration document,
 * not from a number typed in here (Constitution IV).
 *
 * Two rules the drawing depends on:
 *
 * - **an empty series is empty**, and says so. It is never drawn as a flat line at
 *   zero, because zero is a measurement and nothing is not;
 * - **a gap is a gap.** Samples carry the simulation tick they were heard at, so a
 *   component that went quiet leaves a hole rather than a line sloping through it.
 */
export interface Sample {
  readonly tick: number;
  readonly value: number;
}

export class Series {
  private readonly samples: Sample[] = [];

  constructor(private readonly bound: number) {}

  push(tick: number, value: number): void {
    const last = this.samples.at(-1);
    // A repeated tick is the same instant reported twice (a rate acknowledgement
    // repeats the tick in force), not a second measurement.
    if (last && last.tick === tick) return;
    this.samples.push({ tick, value });
    while (this.samples.length > this.bound) this.samples.shift();
  }

  get length(): number {
    return this.samples.length;
  }

  get empty(): boolean {
    return this.samples.length === 0;
  }

  latest(): Sample | undefined {
    return this.samples.at(-1);
  }

  all(): readonly Sample[] {
    return this.samples;
  }

  /**
   * The polyline segments, in the drawing box given, split wherever the gap between
   * consecutive samples exceeds `stride` — the cadence the series is expected at.
   * Returns nothing at all for an empty series: the caller says "nothing heard yet"
   * rather than drawing a line through no data.
   */
  segments(box: { x: number; y: number; width: number; height: number }, stride: number): string[] {
    if (this.samples.length === 0) return [];
    const values = this.samples.map((sample) => sample.value);
    let low = Math.min(...values);
    let high = Math.max(...values);
    if (high - low < 1e-9) {
      // A flat series is genuinely flat: centre it rather than dividing by nothing.
      low -= 0.5;
      high += 0.5;
    }
    const firstTick = this.samples[0].tick;
    const lastTick = this.samples.at(-1)?.tick ?? firstTick;
    const span = Math.max(1, lastTick - firstTick);
    const place = (sample: Sample) => ({
      x: box.x + (box.width * (sample.tick - firstTick)) / span,
      y: box.y + box.height - (box.height * (sample.value - low)) / (high - low),
    });

    const runs: Sample[][] = [[]];
    for (const [index, sample] of this.samples.entries()) {
      const previous = this.samples[index - 1];
      if (previous && stride > 0 && sample.tick - previous.tick > stride * 1.5) runs.push([]);
      runs.at(-1)?.push(sample);
    }
    return runs
      .filter((run) => run.length > 1)
      .map((run) =>
        run
          .map((sample) => {
            const point = place(sample);
            return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
          })
          .join(' '),
      );
  }
}
