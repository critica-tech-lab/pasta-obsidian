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
import { getTextColorForBackground, hexToRgba } from "./color";

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
