/**
 * The uncertainty field, reduced to what can usefully be drawn, saying what it reduced it to.
 *
 * FR-024 is one requirement with one word doing all the work: *never silently*. A field
 * with a hundred thousand cells cannot be drawn at a hundred thousand cells, and every
 * display that meets that problem downsamples. The failure is not the downsampling; it is
 * a display that downsamples and then presents the result at the resolution the viewer
 * assumed. So this module returns the resolution it is showing beside the cells it is
 * showing, and the display prints it.
 *
 * The reduction is a stride, deliberately, rather than an average. Averaging four cells
 * into one produces a value no cell had, which is a small piece of bespoke mathematics
 * arriving in the browser by the back door; a stride shows cells the field actually
 * contains and says how many it skipped. The same argument as FR-022's, one scale down.
 *
 * These are layer inputs rather than a Deck.gl layer object. What is worth testing about a
 * map layer is the data behind it and the accessors that read it, and a function returning
 * both can be tested without a WebGL context.
 */

/** One cell of the field, in the display's own vocabulary. */
export interface FieldCell {
  readonly latitude: number;
  readonly longitude: number;
  /** The published per-cell ensemble spread, in the units telemetry reports it in. */
  readonly spread: number;
}

export interface FieldGrid {
  readonly runId: string;
  /** Cells in row-major order, as many as the field has. */
  readonly cells: readonly FieldCell[];
  readonly columns: number;
  readonly rows: number;
}

export interface DrawnField {
  readonly runId: string;
  readonly cells: readonly FieldCell[];
  /** One in every `stride` cells on each axis is drawn. One means the field entire. */
  readonly stride: number;
  readonly columns: number;
  readonly rows: number;
  /** How many cells the field has, before anything was skipped. */
  readonly cellsInField: number;
  readonly downsampled: boolean;
}

/**
 * How many cells are drawn before the field is reduced.
 *
 * A display bound. It changes how much of the field is drawn and never what the field
 * says, and it can neither light a component nor draw a transit.
 */
export const DEFAULT_MAXIMUM_DRAWN_CELLS = 4096;

/** The smallest stride that brings a grid inside the bound. */
function strideFor(columns: number, rows: number, maximum: number): number {
  const cap = Math.max(1, Math.floor(maximum));
  let stride = 1;
  while (Math.ceil(columns / stride) * Math.ceil(rows / stride) > cap) {
    stride += 1;
  }
  return stride;
}

/** Reduce a field to what can be drawn, and say by how much. */
export function drawnField(
  grid: FieldGrid,
  maximumDrawnCells: number = DEFAULT_MAXIMUM_DRAWN_CELLS,
): DrawnField {
  const cellsInField = grid.columns * grid.rows;
  const stride = strideFor(grid.columns, grid.rows, maximumDrawnCells);
  if (stride === 1) {
    return {
      runId: grid.runId,
      cells: grid.cells,
      stride,
      columns: grid.columns,
      rows: grid.rows,
      cellsInField,
      downsampled: false,
    };
  }
  const cells: FieldCell[] = [];
  for (let row = 0; row < grid.rows; row += stride) {
    for (let column = 0; column < grid.columns; column += stride) {
      const cell = grid.cells[row * grid.columns + column];
      if (cell !== undefined) {
        cells.push(cell);
      }
    }
  }
  return {
    runId: grid.runId,
    cells,
    stride,
    columns: Math.ceil(grid.columns / stride),
    rows: Math.ceil(grid.rows / stride),
    cellsInField,
    downsampled: true,
  };
}

/** The sentence a display prints beside the overlay, stating what it is showing. */
export function resolutionWords(field: DrawnField): string {
  if (!field.downsampled) {
    return `Showing the field entire: ${field.cells.length} cells, ${field.columns} by ${field.rows}.`;
  }
  return (
    `Downsampled for drawing: showing 1 cell in ${field.stride} on each axis — ` +
    `${field.cells.length} of ${field.cellsInField} cells, ${field.columns} by ${field.rows}. ` +
    `Every cell drawn is a cell the field contains; none is an average of others.`
  );
}

/** The inputs a Deck.gl grid layer needs: the data, and how to read a cell. */
export interface LayerInputs {
  readonly id: string;
  readonly data: readonly FieldCell[];
  readonly getPosition: (cell: FieldCell) => readonly [number, number];
  readonly getValue: (cell: FieldCell) => number;
  /** The observed range of the drawn cells, so the legend states what the shading spans. */
  readonly valueRange: readonly [number, number];
}

/** Layer inputs for a drawn field. Pure, so the same field gives the same inputs. */
export function layerInputs(field: DrawnField): LayerInputs {
  let lowest = Number.POSITIVE_INFINITY;
  let highest = Number.NEGATIVE_INFINITY;
  for (const cell of field.cells) {
    lowest = Math.min(lowest, cell.spread);
    highest = Math.max(highest, cell.spread);
  }
  const empty = field.cells.length === 0;
  return {
    id: `uncertainty-${field.runId}`,
    data: field.cells,
    getPosition: (cell) => [cell.longitude, cell.latitude],
    getValue: (cell) => cell.spread,
    valueRange: empty ? [0, 0] : [lowest, highest],
  };
}
