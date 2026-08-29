// A gate that always fails: hands the runner something it must report.
export function runGate() {
  return [{ file: 'planted.ts', line: 1, message: 'always fails, by design' }];
}
