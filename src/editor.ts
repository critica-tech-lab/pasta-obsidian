import { EditorSelection, EditorState } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { PastaEditorCursor } from "./types/editor";

export type CursorOptions = {
	onCursorChange: (
		current: EditorSelection,
		previous: EditorSelection,
		view: EditorView,
	) => void;
};

class CaretWidget extends WidgetType {
	constructor(
		private label: string,
		private userId: string,
		private color: string,
	) {
		super();
	}

	toDOM() {
		const wrap = document.createElement("span");
		wrap.className = "cm-pasta-caret-wrap";
		wrap.style.setProperty("--caret-color", this.color);

		wrap.style.setProperty(
			"--caret-text-color",
			getTextColorForBackground(this.color),
		);

		const bar = document.createElement("span");
		bar.className = "cm-pasta-caret";
		wrap.appendChild(bar);

		const tag = document.createElement("span");
		tag.className = "cm-pasta-caret-label";
		tag.textContent = this.label;
		wrap.appendChild(tag);

		return wrap;
	}

	ignoreEvent() {
		return true;
	}
}

function render(
	state: EditorState,
	cursors: PastaEditorCursor[],
): DecorationSet {
	const ranges: { from: number; to: number; deco: Decoration }[] = [];

	const clamp = (n: number, lo: number, hi: number) =>
		Math.max(lo, Math.min(hi, n));

	for (const c of cursors) {
		const from = clamp(Math.min(c.from, c.to), 0, state.doc.length);
		const to = clamp(Math.max(c.from, c.to), 0, state.doc.length);

		if (from !== to) {
			console.log(c.color);
			ranges.push({
				from,
				to,
				deco: Decoration.mark({
					class: "cm-pasta-selection",
					attributes: {
						style: `--selection-color: ${hexToRgba(c.color, 0.5)}`,
					},
				}),
			});
		}

		// Caret at the `to` end; side:1 so it sits after the char
		ranges.push({
			from: to,
			to,
			deco: Decoration.widget({
				widget: new CaretWidget(c.label ?? "???", c.userId, c.color),
				side: 1,
			}),
		});
	}

	return Decoration.set(
		ranges.map((r) => r.deco.range(r.from, r.to)),
		true,
	);
}

function localCursorWatcher(opts?: CursorOptions) {
	return ViewPlugin.fromClass(
		class {
			private lastSel: EditorSelection;

			constructor(private view: EditorView) {
				this.lastSel = view.state.selection;
			}

			update(update: ViewUpdate) {
				if (update.selectionSet) {
					const prev = this.lastSel;
					this.lastSel = update.state.selection;

					if (opts?.onCursorChange) {
						opts.onCursorChange(
							update.state.selection,
							prev,
							this.view,
						);
					}
				}
			}
		},
	);
}

export function cursorsExtension(options: CursorOptions) {
	const remoteCursors = ViewPlugin.fromClass(
		class {
			cursors: PastaEditorCursor[] = [];
			decos: DecorationSet = Decoration.none;

			constructor(private view: EditorView) {}

			set(cursors: PastaEditorCursor[]) {
				this.cursors = cursors;
				this.decos = render(this.view.state, cursors);
			}

			clear() {
				this.cursors = [];
				this.decos = Decoration.none;
			}

			update(u: ViewUpdate) {
				if (u.docChanged && this.cursors.length) {
					// remap stored offsets through changes
					this.cursors = this.cursors.map((c) => ({
						from: u.changes.mapPos(c.from, 1),
						to: u.changes.mapPos(c.to, 1),
						label: c.label,
						userId: c.userId,
						color: c.color,
					}));
					this.decos = render(u.state, this.cursors);
				}
			}
		},
		{
			decorations: (v) => v.decos,
		},
	);

	const updateCursors = (view: EditorView, cursors: PastaEditorCursor[]) => {
		const inst = view.plugin(remoteCursors);
		if (!inst) return;

		inst.set(cursors);
		view.dispatch({}); // trigger re-render
	};

	return {
		extension: [remoteCursors, localCursorWatcher(options)],
		updateCursors,
	};
}

const FLEXOKI: readonly string[] = [
	"#D14D41",
	"#DA702C",
	"#D0A215",
	"#879A39",
	"#3AA99F",
	"#3AA99F",
	"#4385BE",
	"#8B7EC8",
	"#CE5D97",
];

// Fast 53-bit string hash with good avalanche
function cyrb53(str: string, seed = 0): number {
	let h1 = 0xdeadbeef ^ seed,
		h2 = 0x41c6ce57 ^ seed;
	for (let i = 0, ch; i < str.length; i++) {
		ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 =
		Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
		Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 =
		Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
		Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (h2 & 0x1fffff) * 0x100000000 + (h1 >>> 0);
}

export function getColorForString(id: string): string {
	const h = cyrb53(id);
	const idx = h % FLEXOKI.length;
	return FLEXOKI[idx];
}

function getTextColorForBackground(backgroundColor: string) {
	const hex = backgroundColor.replace("#", "");

	// parse r, g, b
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 2), 16);
	const b = parseInt(hex.substring(4, 2), 16);

	// relative luminance (per WCAG)
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

	// pick text color
	return luminance > 0.5 ? "black" : "white";
}

function hexToRgba(hex: string, alpha = 1) {
	let c = hex.replace("#", "");
	if (c.length === 3) {
		// expand shorthand #abc → #aabbcc
		c = c
			.split("")
			.map((ch) => ch + ch)
			.join("");
	}
	const r = parseInt(c.slice(0, 2), 16);
	const g = parseInt(c.slice(2, 4), 16);
	const b = parseInt(c.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
