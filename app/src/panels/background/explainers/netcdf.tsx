/**
 * 3 — NetCDF (interactive, 6 steps).
 *
 * The file explains itself. Units, reference frame and time origin travel inside it,
 * so a reader in thirty years needs no surviving author.
 */
import { INK, MarkDefs, PokeRegion, categoryStyle, range } from '../marks.js';
import { Readout } from '../layout.js';
import type { Explainer } from '../model.js';

const fields = categoryStyle('fields');

const VALUES = [
  [11.4, 11.2, 10.9, 10.4],
  [10.8, 10.6, 10.3, 9.9],
  [8.2, 8.1, 7.9, 7.6],
  [5.1, 5.0, 4.9, 4.8],
];

function Block({ labelled }: { labelled: boolean }) {
  return (
    <g>
      {VALUES.map((row, rowIndex) =>
        row.map((value, columnIndex) => (
          <g key={`${rowIndex}-${columnIndex}`}>
            <rect
              x={90 + columnIndex * 44}
              y={34 + rowIndex * 30}
              width={44}
              height={30}
              fill="none"
              stroke={labelled ? fields.stroke : INK.line}
              strokeWidth={labelled ? fields.strokeWidth : 1}
            />
            <text
              x={112 + columnIndex * 44}
              y={53 + rowIndex * 30}
              fontSize="10"
              textAnchor="middle"
              fill={INK.strong}
            >
              {value.toFixed(1)}
            </text>
          </g>
        )),
      )}
    </g>
  );
}

export const netcdf: Explainer = {
  id: 'netcdf',
  title: 'NetCDF',
  form: 'interactive',
  idea: 'A file that explains itself. Units, reference frame and time origin travel inside it, so a reader in thirty years needs no surviving author.',
  steps: [
    {
      title: 'A block of numbers means nothing',
      prose: [
        'Sixteen values. Celsius or Kelvin? Which way is down? Is the first row the surface or the seabed?',
        'The rest of this explainer is about putting those answers inside the file rather than beside it.',
      ],
      figure: {
        minWidth: 340,
        label: 'A bare block of numbers with no labels of any kind',
        caption: 'Values with no units, no axes and no reference frame.',
        draw: () => (
          <svg viewBox="0 0 300 170" width="100%">
            <MarkDefs />
            <Block labelled={false} />
          </svg>
        ),
      },
    },
    {
      title: 'Dimensions give each number a position',
      prose: [
        'Four axes: longitude, latitude, depth, time. The block is now an addressed volume.',
        'The addresses do not yet correspond to anywhere on Earth.',
      ],
      figure: {
        minWidth: 340,
        label: 'The same block gaining named dimensions along its axes',
        caption: 'Dimensions give each value an index along four axes.',
        draw: () => (
          <svg viewBox="0 0 300 170" width="100%">
            <MarkDefs />
            <Block labelled={false} />
            <text x="90" y="26" fontSize="10" fill={fields.stroke}>
              longitude →
            </text>
            <text x="10" y="80" fontSize="10" fill={fields.stroke}>
              depth
            </text>
            <text x="10" y="94" fontSize="10" fill={fields.stroke}>
              ↓
            </text>
            <text x="90" y="168" fontSize="9" fill={INK.quiet}>
              and two more: latitude, time
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'Coordinates put the position on Earth',
      prose: [
        'The axes now carry values: 14°W to 8°W, surface to a thousand metres.',
        'Each number resolves to a specific volume of water.',
      ],
      play: 'Pick a cell to see the coordinate it resolves to.',
      figure: {
        minWidth: 360,
        label: 'The axes gaining real coordinate values, each cell resolving to a position',
        caption: 'Coordinates map each index to a position on Earth.',
        draw: ({ poke, onPoke }) => (
          <>
          <svg viewBox="0 0 300 170" width="100%">
            <MarkDefs />
            <Block labelled />
            {['14°W', '12°W', '10°W', '8°W'].map((tick, index) => (
              <text key={tick} x={112 + index * 44} y="28" fontSize="9" textAnchor="middle" fill={INK.quiet}>
                {tick}
              </text>
            ))}
            {['0 m', '50 m', '200 m', '800 m'].map((tick, index) => (
              <text key={tick} x="84" y={53 + index * 30} fontSize="9" textAnchor="end" fill={INK.quiet}>
                {tick}
              </text>
            ))}
            {range(4).map((row) =>
              range(4).map((column) => (
                <PokeRegion
                  key={`${row}-${column}`}
                  x={90 + column * 44}
                  y={34 + row * 30}
                  width={44}
                  height={30}
                  label={`cell at ${['14°W', '12°W', '10°W', '8°W'][column]}, ${['0 m', '50 m', '200 m', '800 m'][row]}`}
                  active={poke === `${row}-${column}`}
                  onPoke={() => onPoke(`${row}-${column}`)}
                />
              )),
            )}
          </svg>
          <Readout>
            {poke
              ? `That cell resolves to ${['14°W', '12°W', '10°W', '8°W'][Number(poke.split('-')[1])]}, 46.0°N, ${['0 m', '50 m', '200 m', '800 m'][Number(poke.split('-')[0])]}.`
              : 'Every index resolves to a position, a depth and an instant. Pick a cell to see one.'}
          </Readout>
          </>
        ),
      },
    },
    {
      title: 'Attributes make the file answer for itself',
      prose: [
        'Celsius, WGS 84, seconds since 1970, and an explicit fill value so missing data is declared rather than inferred from a suspicious zero.',
        'None of it lives outside the file.',
      ],
      figure: {
        minWidth: 360,
        label: 'Attributes attaching units, reference frame and time origin to the block',
        caption: 'Attributes carry units, reference frame, time origin and fill value.',
        draw: () => (
          <svg viewBox="0 0 300 190" width="100%">
            <MarkDefs />
            <Block labelled />
            <rect x="16" y="158" width="268" height="26" fill="none" stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            {[
              'units = degree_C',
              'crs = WGS 84',
              'time origin = seconds since 1970',
              '_FillValue = -9999',
            ].map((attribute, index) => (
              <text key={attribute} x={22 + (index % 2) * 140} y={168 + Math.floor(index / 2) * 12} fontSize="8.5" fill={INK.line}>
                {attribute}
              </text>
            ))}
            <text x="16" y="152" fontSize="9" fill={fields.stroke}>
              inside the same file
            </text>
          </svg>
        ),
      },
    },
    {
      title: 'Thirty years on',
      prose: [
        'Same file, no author, no wiki, no schema registry. It still opens and still describes itself.',
        'The alternative is not a worse format. It is a format that depends on someone who has moved on.',
      ],
      figure: {
        minWidth: 340,
        label: 'The same file opened decades later without its author, beside a CSV whose headers no longer mean anything',
        caption: 'The same two files opened decades later.',
        draw: () => (
          <svg viewBox="0 0 300 170" width="100%">
            <MarkDefs />
            <rect x="12" y="20" width="128" height="130" fill="none" stroke={fields.stroke} strokeWidth={fields.strokeWidth} />
            <text x="20" y="40" fontSize="10" fill={fields.stroke}>
              the NetCDF file
            </text>
            {['opens', 'states its units', 'states its frame', 'states its origin', 'declares its gaps'].map((line, index) => (
              <text key={line} x="20" y={60 + index * 18} fontSize="9.5" fill={INK.line}>
                {line}
              </text>
            ))}
            <rect x="160" y="20" width="128" height="130" fill="none" stroke={INK.warn} strokeDasharray="4 3" />
            <text x="168" y="40" fontSize="10" fill={INK.warn}>
              the CSV beside it
            </text>
            {['opens', 't1, t2, t3 …', 'units? somewhere', 'origin? ask Dave', '0 means what?'].map((line, index) => (
              <text key={line} x="168" y={60 + index * 18} fontSize="9.5" fill={INK.warn}>
                {line}
              </text>
            ))}
            <text x="12" y="164" fontSize="9" fill={INK.quiet}>
              Dave retired in 2031.
            </text>
          </svg>
        ),
      },
    },
  ],
  value: {
    'through-life cost': {
      kind: 'filled',
      body: 'Self-description removes the obligation to keep a separate document accurate. That obligation is rarely funded and usually assumed.',
      qualitative: true,
    },
    interoperability: {
      kind: 'filled',
      body: 'Existing readers open it without a per-producer parser.',
    },
    'what you do not have to build': {
      kind: 'filled',
      body: 'A metadata sidecar, a schema registry, and a convention document to keep in step with both.',
    },
  },
};
