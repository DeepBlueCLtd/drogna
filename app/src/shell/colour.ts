/**
 * Relative luminance and contrast, WCAG 2.1's own definitions.
 *
 * Extracted when a second caller appeared. The console's palette check (`contrast.test.ts`)
 * asks whether the secondary text can be read on every surface the shell paints; the
 * consumers' greyscale check (`panels/consumers/greyscale.test.ts`) asks whether two marks
 * a reader has to tell apart still differ once colour is gone. Both questions are the same
 * arithmetic, and two copies of it would be two chances to get the sRGB transfer curve
 * subtly wrong in one of them.
 *
 * Luminance is what survives greyscale: converting an image to grey is, to a first
 * approximation, replacing each colour with its luminance. So a pair that separates here
 * separates on a monochrome screen and in a monochrome print, which is the claim the
 * consumers' check is actually making.
 */

/** A `#rrggbb` colour's relative luminance, on [0, 1]. */
export function luminance(hex: string): number {
  const packed = Number.parseInt(hex.slice(1), 16);
  const channel = (raw: number) => {
    const unit = raw / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((packed >> 16) & 0xff) +
    0.7152 * channel((packed >> 8) & 0xff) +
    0.0722 * channel(packed & 0xff)
  );
}

/** The contrast ratio between two `#rrggbb` colours, from 1 to 21. */
export function contrast(one: string, other: string): number {
  const [a, b] = [luminance(one), luminance(other)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** WCAG 2.1 AA, 1.4.3: body text against its background. */
export const AA_TEXT = 4.5;
/** WCAG 2.1 AA, 1.4.11: the least difference that reads as two colours at all. */
export const AA_NON_TEXT = 3;
