/**
 * The shared category vocabulary (FR-011) and the marks for the seeded features
 * (FR-012).
 *
 * A category is a hue **together with** a texture and a line weight. That is the
 * whole point of this module: an explainer asks for a category and receives all
 * three, so a distinction that exists only in hue cannot be written. Greyscale
 * legibility is then a property of the vocabulary rather than a promise kept by
 * review — the fault this repository has watched rot before.
 *
 * Three meanings, not two. The third is the **archive**: the coarse multi-decade
 * prior the system already holds (SRD FR-21). It is not "truth you never have" —
 * drogna records ground truth in a manifest and scores recovery against it
 * (Constitution IX), and an explainer must not teach otherwise.
 *
 * There is deliberately no shared scene. Ten arguments want ten framings; what
 * carries between them is this vocabulary, so the eddy drawn here is the eddy a
 * viewer met in the Map.
 */
import type { ReactNode, SVGProps } from 'react';

export type Category = 'points' | 'fields' | 'archive';

export interface CategoryStyle {
  readonly stroke: string;
  /** The texture, as a reference to a pattern defined by <MarkDefs/>. */
  readonly fill: string;
  /**
   * The same texture at full strength, for the key. A drawing carries labels over
   * its fills and needs the texture faint; the key carries none and needs it plain,
   * because the key is where the texture is learned.
   */
  readonly keyFill: string;
  readonly strokeWidth: number;
  readonly strokeDasharray?: string;
  /** What this category means, for legends and for prose that names it. */
  readonly meaning: string;
}

/**
 * The one table. Each row differs from every other in hue, in texture and in weight,
 * so any two categories stay apart when the hue is taken away.
 */
const CATEGORIES: Readonly<Record<Category, CategoryStyle>> = {
  points: {
    stroke: '#e39a44',
    fill: 'url(#mark-texture-points)',
    keyFill: 'url(#mark-key-points)',
    strokeWidth: 2.6,
    meaning: 'observations — casts, readings, what a sensor sampled',
  },
  fields: {
    stroke: '#5fb8ac',
    fill: 'url(#mark-texture-fields)',
    keyFill: 'url(#mark-key-fields)',
    strokeWidth: 1.3,
    meaning: 'fields — gridded and computed, a value everywhere',
  },
  archive: {
    stroke: '#93a8b0',
    fill: 'url(#mark-texture-archive)',
    keyFill: 'url(#mark-key-archive)',
    strokeWidth: 1,
    strokeDasharray: '5 3',
    meaning: 'the archive — the coarse prior already held',
  },
};

export function categoryStyle(category: Category): CategoryStyle {
  return CATEGORIES[category];
}

export const CATEGORY_ORDER: readonly Category[] = ['points', 'fields', 'archive'];

/** Neutral ink for the parts of a drawing that carry no category. */
export const INK = {
  line: '#8b9ca6',
  strong: '#d5dde5',
  // Lifted from #61707c: a gloss under a label is the line most often set over a
  // texture, and at the old value it was dim before the texture even reached it.
  quiet: '#8b9aa5',
  /** A refusal, a fault, a cost. Never a category. */
  warn: '#e08a76',
} as const;

/**
 * The dashed outline every region that responds to the viewer carries (FR-025).
 * Static, so nothing animates on arrival (FR-019); learned once, so free play is
 * discoverable across all ten explainers; and it survives greyscale like any
 * other mark.
 *
 * `pointerEvents: 'all'` is what makes the outlined area a target rather than a
 * picture of one. An unfilled SVG shape hit-tests on its stroke alone, so before this
 * the only clickable pixels in a poke region were the dashes of its own 1px outline —
 * twenty-five of the course's forty-six regions could not be hit at their centre at
 * all, and the twenty-one that could worked by accident, because a mark drawn inside
 * them happened to lie under the pointer. The keyboard route was unaffected, which is
 * why the walk that proves FR-014 passed throughout.
 */
export const POKE_OUTLINE: SVGProps<SVGRectElement> = {
  stroke: INK.quiet,
  strokeDasharray: '3 3',
  strokeWidth: 1,
  fill: 'none',
  pointerEvents: 'all',
};

/**
 * The pattern definitions the category fills reference. Every figure renders this
 * once inside its own <svg>, because an SVG pattern is resolved within its document
 * fragment and a figure must be legible on its own.
 *
 * The textures are deliberately faint. They started at full strength and made the
 * label inside a filled box hard to read — a texture that costs you the words it
 * surrounds has taken more than it gave. What matters for FR-011 is that the three
 * categories stay *distinguishable* without hue, and they do: dots, diagonal hatch
 * and a grid are different shapes at any opacity, and the outline that carries each
 * category's line weight is drawn at full strength regardless.
 */
const TEXTURE_OPACITY = 0.16;

export function MarkDefs(): ReactNode {
  return (
    <defs>
      <pattern id="mark-texture-points" width="6" height="6" patternUnits="userSpaceOnUse">
        <circle
          cx="1.6"
          cy="1.6"
          r="1.15"
          fill={CATEGORIES.points.stroke}
          opacity={TEXTURE_OPACITY + 0.08}
        />
      </pattern>
      <pattern
        id="mark-texture-fields"
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="6"
          stroke={CATEGORIES.fields.stroke}
          strokeWidth="1.6"
          opacity={TEXTURE_OPACITY}
        />
      </pattern>
      <pattern id="mark-texture-archive" width="7" height="7" patternUnits="userSpaceOnUse">
        <path
          d="M0 0H7M0 0V7"
          stroke={CATEGORIES.archive.stroke}
          strokeWidth="0.7"
          fill="none"
          opacity={TEXTURE_OPACITY + 0.06}
        />
      </pattern>
      {/* The same three at full strength, for the key alone. */}
      <pattern id="mark-key-points" width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="1.6" cy="1.6" r="1.25" fill={CATEGORIES.points.stroke} />
      </pattern>
      <pattern
        id="mark-key-fields"
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line x1="0" y1="0" x2="0" y2="6" stroke={CATEGORIES.fields.stroke} strokeWidth="2.2" />
      </pattern>
      <pattern id="mark-key-archive" width="7" height="7" patternUnits="userSpaceOnUse">
        <path d="M0 0H7M0 0V7" stroke={CATEGORIES.archive.stroke} strokeWidth="0.9" fill="none" />
      </pattern>
    </defs>
  );
}

/** The legend, drawn from the same table the marks are: it cannot disagree with them. */
export function CategoryKey(): ReactNode {
  return (
    <ul className="bg-key">
      {CATEGORY_ORDER.map((category) => {
        const style = categoryStyle(category);
        return (
          <li key={category}>
            <svg width="34" height="16" aria-hidden="true">
              <MarkDefs />
              <rect
                x="1"
                y="1"
                width="32"
                height="14"
                fill={style.keyFill}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeDasharray={style.strokeDasharray}
              />
            </svg>
            <span>
              <b>{category}</b> — {style.meaning}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A region of a drawing the viewer may poke (FR-018), wearing the one affordance
 * (FR-025) and reachable without a pointer (FR-014).
 *
 * Free play is a second route to states the spine already reaches, so nothing here
 * is the only way to anything. The outline is static: it is the only signal that a
 * diagram responds, because nothing animates on arrival (FR-019). What the outline
 * does under the pointer or under keyboard focus is not arrival behaviour and is not
 * a second affordance — it is the region confirming that the first one meant it.
 */
export function PokeRegion({
  x,
  y,
  width,
  height,
  label,
  active,
  onPoke,
  children,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  active: boolean;
  onPoke: () => void;
  children?: ReactNode;
}): ReactNode {
  return (
    <g
      className="bg-poke"
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={active}
      onClick={onPoke}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        onPoke();
      }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        {...POKE_OUTLINE}
        strokeWidth={active ? 2 : POKE_OUTLINE.strokeWidth}
        stroke={active ? INK.strong : (POKE_OUTLINE.stroke as string)}
      />
      {children}
    </g>
  );
}

/* ------------------------------------------------------------------ *
 * The seeded features (SRD FR-06), drawn the same way wherever they   *
 * appear, so a viewer moving between Background and Map recognises    *
 * the thing named even in an unfamiliar frame.                        *
 * ------------------------------------------------------------------ */

export interface MarkPlacement {
  readonly x: number;
  readonly y: number;
  /** 1 draws the mark at its natural size; the figure scales it to its own frame. */
  readonly scale?: number;
  readonly label?: string;
}

function labelFor(placement: MarkPlacement, dy: number): ReactNode {
  if (!placement.label) return null;
  return (
    <text x={0} y={dy} fontSize={9} textAnchor="middle" fill={INK.quiet}>
      {placement.label}
    </text>
  );
}

/** The warm-core eddy: a closed spiral, always drawn in the fields vocabulary. */
export function Eddy(placement: MarkPlacement): ReactNode {
  const style = categoryStyle('fields');
  const scale = placement.scale ?? 1;
  return (
    <g transform={`translate(${placement.x} ${placement.y}) scale(${scale})`}>
      <circle r="18" fill={style.fill} stroke={style.stroke} strokeWidth={style.strokeWidth} />
      <path
        d="M0 -11 A11 11 0 1 1 -8 8 A8 8 0 1 0 5 3"
        fill="none"
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
      />
      {labelFor(placement, 32)}
    </g>
  );
}

/** The front: a steep gradient, drawn as a doubled boundary line. */
export function Front(placement: MarkPlacement): ReactNode {
  const style = categoryStyle('fields');
  const scale = placement.scale ?? 1;
  return (
    <g transform={`translate(${placement.x} ${placement.y}) scale(${scale})`}>
      <path d="M-26 12 C -8 4, 8 -4, 26 -12" fill="none" stroke={style.stroke} strokeWidth={style.strokeWidth * 2} />
      <path d="M-26 18 C -8 10, 8 2, 26 -6" fill="none" stroke={style.stroke} strokeWidth={style.strokeWidth} />
      {labelFor(placement, 34)}
    </g>
  );
}

/** The thermocline: the layer boundary, drawn across the frame at its depth. */
export function Thermocline(placement: MarkPlacement & { readonly width: number }): ReactNode {
  const style = categoryStyle('fields');
  const half = placement.width / 2;
  return (
    <g transform={`translate(${placement.x} ${placement.y})`}>
      <path
        d={`M${-half} 0 Q ${-half / 2} -5, 0 0 T ${half} 0`}
        fill="none"
        stroke={style.stroke}
        strokeWidth={style.strokeWidth * 2}
      />
      <path
        d={`M${-half} 5 Q ${-half / 2} 0, 0 5 T ${half} 5`}
        fill="none"
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        strokeDasharray="4 3"
      />
      {placement.label ? (
        <text x={-half + 2} y={-8} fontSize={9} fill={INK.quiet}>
          {placement.label}
        </text>
      ) : null}
    </g>
  );
}

/** The drifting feature: the eddy's mark with a displacement arrow off it. */
export function DriftingFeature(placement: MarkPlacement): ReactNode {
  const style = categoryStyle('fields');
  const scale = placement.scale ?? 1;
  return (
    <g transform={`translate(${placement.x} ${placement.y}) scale(${scale})`}>
      <circle r="11" fill={style.fill} stroke={style.stroke} strokeWidth={style.strokeWidth} strokeDasharray="4 3" />
      <path d="M13 0 H30 M25 -4 L30 0 L25 4" fill="none" stroke={INK.line} strokeWidth="1.2" />
      {labelFor(placement, 26)}
    </g>
  );
}

/** 0…n-1, for a drawing that repeats a mark across a grid. */
export function range(count: number): number[] {
  return [...Array(count).keys()];
}

/** One observation: the points vocabulary at its smallest. */
export function Sample(placement: MarkPlacement): ReactNode {
  const style = categoryStyle('points');
  const scale = placement.scale ?? 1;
  return (
    <g transform={`translate(${placement.x} ${placement.y}) scale(${scale})`}>
      <circle r="4.5" fill={style.stroke} stroke={style.stroke} strokeWidth={style.strokeWidth} />
      {labelFor(placement, 16)}
    </g>
  );
}
