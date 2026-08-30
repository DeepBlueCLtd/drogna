/**
 * The one dense solve the analysis needs, and nothing more (feature 115).
 *
 * The system the analysis solves is HBHᵀ + R: one row per observation in the cycle,
 * and the platform carries four instruments on a thirty-tick cadence, so the order is
 * tens rather than thousands. That is the whole argument for a direct factorisation
 * here — this is not a linear-algebra library, and no iterative solver, no sparsity
 * scheme and no matrix abstraction is warranted by a matrix this size. If a later
 * feature puts a fleet in the water, that argument is re-made rather than inherited.
 *
 * HBHᵀ + R is symmetric positive definite whenever every observation declares a
 * non-zero error, because B is positive semi-definite and R is then strictly positive
 * on the diagonal. Cholesky is therefore the right factorisation, and — this is why it
 * is preferred to a general solve — its failure is informative rather than silent: a
 * non-positive pivot means the caller handed in a system that cannot arise from a
 * covariance and an error, and the refusal names which pivot and what was left of it.
 */

/** Row-major index into a dense `order`-by-`order` matrix. */
function at(row: number, column: number, order: number): number {
  return row * order + column;
}

/**
 * The lower-triangular Cholesky factor L, where L Lᵀ is the given matrix. Refuses,
 * naming the pivot, when the matrix is not positive definite — two observations at
 * one cell both declaring no error is the way that happens in practice, and it is a
 * fault in what was handed in rather than a rounding accident to be nudged past.
 */
export function choleskyFactor(matrix: Float64Array, order: number): Float64Array {
  if (matrix.length !== order * order) {
    throw new Error(`the matrix holds ${matrix.length} entries, which is not ${order}×${order}`);
  }
  const lower = new Float64Array(order * order);
  for (let row = 0; row < order; row++) {
    for (let column = 0; column <= row; column++) {
      let sum = matrix[at(row, column, order)];
      for (let k = 0; k < column; k++) {
        sum -= lower[at(row, k, order)] * lower[at(column, k, order)];
      }
      if (row === column) {
        if (!(sum > 0)) {
          throw new Error(
            `the system is not positive definite: pivot ${row} left ${sum}. Two observations at one cell, both declaring no error, is the way that happens.`,
          );
        }
        lower[at(row, column, order)] = Math.sqrt(sum);
      } else {
        lower[at(row, column, order)] = sum / lower[at(column, column, order)];
      }
    }
  }
  return lower;
}

/** Solves L Lᵀ x = b for a factor from `choleskyFactor`, by forward then back substitution. */
export function choleskySolve(lower: Float64Array, order: number, rightHandSide: Float64Array): Float64Array {
  if (rightHandSide.length !== order) {
    throw new Error(`the right-hand side holds ${rightHandSide.length} entries, which is not ${order}`);
  }
  const solution = new Float64Array(order);
  for (let row = 0; row < order; row++) {
    let sum = rightHandSide[row];
    for (let k = 0; k < row; k++) sum -= lower[at(row, k, order)] * solution[k];
    solution[row] = sum / lower[at(row, row, order)];
  }
  for (let row = order - 1; row >= 0; row--) {
    let sum = solution[row];
    for (let k = row + 1; k < order; k++) sum -= lower[at(k, row, order)] * solution[k];
    solution[row] = sum / lower[at(row, row, order)];
  }
  return solution;
}

/**
 * The explicit inverse, column by column. Forming an inverse is usually the wrong
 * instinct, and it is the right one here for a stated reason: the analysis needs the
 * same inverse against one right-hand side per grid cell — thousands of them — so
 * factorising once and inverting once costs `order` solves and saves the rest.
 */
export function choleskyInverse(lower: Float64Array, order: number): Float64Array {
  const inverse = new Float64Array(order * order);
  const basis = new Float64Array(order);
  for (let column = 0; column < order; column++) {
    basis.fill(0);
    basis[column] = 1;
    const solved = choleskySolve(lower, order, basis);
    for (let row = 0; row < order; row++) inverse[at(row, column, order)] = solved[row];
  }
  return inverse;
}
