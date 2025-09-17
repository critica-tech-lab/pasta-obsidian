import { cyrb53 } from "@alwatr/cyrb53";

/**
 * Based on [Flexoki](https://github.com/kepano/flexoki) color palette
 */
const COLOR_PALETTE: readonly string[] = [
	"#AF3029",
	"#BC5215",
	"#AD8301",
	"#66800B",
	"#24837B",
	"#205EA6",
	"#5E409D",
	"#A02F6F",
];

/**
 * Normalizes a hex color by removing the hash prefix, trimming whitespace, and
 * expanding shorthand `#rgb` values into six-character `#rrggbb` strings.
 *
 * @param hexColor - Incoming hex color which may include `#` and shorthand notation.
 * @returns A six-character hex string without the leading `#`.
 */
function normalizeHexColor(hexColor: string): string {
	const stripped = hexColor.replace("#", "").trim();

	if (stripped.length === 3) {
		return stripped
			.split("")
			.map((character) => character + character)
			.join("");
	}

	return stripped;
}

/**
 * Generates a deterministic highlight color for an identifier by hashing the value
 * and mapping it to the Flexoki palette. This keeps cursor colors stable across sessions.
 *
 * @param id - Unique identifier for a remote user or cursor source.
 * @returns Hex color code sourced from the Flexoki palette.
 */
export function getColorForString(id: string): string {
	const value = cyrb53(id);
	const index = value % COLOR_PALETTE.length;
	const color = COLOR_PALETTE[index];

	return color;
}

/**
 * Chooses a contrasting text color (black or white) for a given background color
 * by computing the relative luminance according to WCAG guidelines.
 *
 * @param backgroundColor - Hex color string describing the background.
 * @returns `"black"` when the background is bright, otherwise `"white"`.
 */
export function getTextColorForBackground(backgroundColor: string) {
	const hex = normalizeHexColor(backgroundColor);
	const red = parseInt(hex.slice(0, 2), 16);
	const green = parseInt(hex.slice(2, 4), 16);
	const blue = parseInt(hex.slice(4, 6), 16);

	const weightedRed = 0.299 * red;
	const weightedGreen = 0.587 * green;
	const weightedBlue = 0.114 * blue;

	const luminance = (weightedRed + weightedGreen + weightedBlue) / 255;

	return luminance > 0.5 ? "black" : "white";
}

/**
 * Converts a hex color string to an `rgba()` CSS value by expanding shorthand forms
 * and decoding the red, green, and blue channels.
 *
 * @param hexColor - Hex color string (supports `#rgb` and `#rrggbb`).
 * @param alpha - Optional alpha channel between `0` and `1`. Defaults to `1`.
 * @returns An `rgba(r, g, b, a)` string ready to be used in CSS.
 */
export function hexToRgba(hexColor: string, alpha = 1) {
	const hex = normalizeHexColor(hexColor);
	const red = parseInt(hex.slice(0, 2), 16);
	const green = parseInt(hex.slice(2, 4), 16);
	const blue = parseInt(hex.slice(4, 6), 16);

	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
