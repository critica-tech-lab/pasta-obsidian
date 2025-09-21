import { EditorSelection, Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { App, MarkdownView, TFile } from "obsidian";
import { backoff } from "src/utils/backoff";
import { getColorForString } from "../color";
import { cursorsExtension } from "../editor";
import {
	EthersyncClient,
	EthersyncCursorRange,
	EthersyncCursorMessage,
} from "../ethersync";
import { PastaSyncSettings } from "../settings";
import { PastaEditorCursor } from "../types/editor";
import { getEthersyncFolder, getVaultBasePath } from "../vault";
import { EthersyncManager } from "./EthersyncManager";

type PastaEditor = {
	connection: EthersyncClient;
	userCursors: Map<string, PastaEditorCursor>;
};

export class EditorManager {
	private editors: Map<string, PastaEditor> = new Map();
	private cursorExtension!: Extension[];
	private updateCursors!: (
		view: EditorView,
		cursors: PastaEditorCursor[],
	) => void;

	constructor(
		private app: App,
		private settings: PastaSyncSettings,
		private processManager: EthersyncManager,
	) {
		const { extension, updateCursors } = cursorsExtension({
			onCursorChange: this.handleCursorChange.bind(this),
		});

		this.cursorExtension = extension;
		this.updateCursors = updateCursors;
	}

	get extension() {
		return this.cursorExtension;
	}

	private handleCursorChange(
		current: EditorSelection,
		previous: EditorSelection,
		view: EditorView,
	) {
		const markdownView =
			this.app.workspace.getActiveViewOfType(MarkdownView);

		if (!markdownView || !markdownView.file) {
			return;
		}

		const { file } = markdownView;

		if (!file.parent || !this.settings.folders.has(file.parent.path)) {
			return;
		}
		if (!this.processManager.hasActiveProcess(file.parent.path)) {
			return;
		}

		const currentRange = current.ranges[0];
		const previousRange = previous.ranges[0];

		if (
			currentRange.from === previousRange.from &&
			currentRange.to === previousRange.to
		) {
			return;
		}

		const editor = this.editors.get(file.path);
		if (!editor) {
			return;
		}

		const startLine = view.state.doc.lineAt(currentRange.from);
		const endLine = view.state.doc.lineAt(currentRange.to);

		const range: EthersyncCursorRange = {
			start: {
				line: startLine.number - 1,
				character: currentRange.from - startLine.from,
			},
			end: {
				line: endLine.number - 1,
				character: currentRange.to - endLine.from,
			},
		};

		editor.connection.updateCursor(range);
	}

	private handleUserCursor(message: EthersyncCursorMessage) {
		const view = this.getActiveEditorView();
		const vaultPath = getVaultBasePath(this.app.vault);

		const posToOffset =
			this.app.workspace.activeEditor?.editor?.posToOffset.bind(
				this.app.workspace.activeEditor?.editor,
			);

		if (!vaultPath || !posToOffset) {
			return;
		}

		const path = message.uri.replace("file://" + vaultPath + "/", "");

		if (message.ranges.length === 0) {
			for (const editor of this.editors.values()) {
				editor.userCursors.delete(message.userid);

				if (this.updateCursors && view) {
					this.updateCursors(
						view,
						Array.from(editor.userCursors.values()),
					);
				}

				return;
			}
		}

		const editor = this.editors.get(path);

		if (!editor || !view) {
			return;
		}

		const from = posToOffset({
			line: message.ranges[0].start.line,
			ch: message.ranges[0].start.character,
		});

		const to = posToOffset({
			line: message.ranges[0].end.line,
			ch: message.ranges[0].end.character,
		});

		if (from === undefined || to === undefined) {
			return;
		}

		editor.userCursors.set(message.userid, {
			label: message.name,
			userId: message.userid,
			from,
			to,
			color: getColorForString(message.userid),
		});

		if (this.updateCursors) {
			this.updateCursors(view, Array.from(editor.userCursors.values()));
		}
	}

	async handleFileOpen(file?: TFile) {
		const vaultPath = getVaultBasePath(this.app.vault);

		if (!file || !vaultPath) return;

		if (this.editors.has(file.path)) {
			return;
		}

		const folder = file.parent;

		if (!folder || !this.settings.folders.has(folder.path)) {
			return;
		}

		await backoff(() => this.createEditorConnection(file, vaultPath));
	}

	private async createEditorConnection(file: TFile, vaultPath: string) {
		const ethersyncFolder = await getEthersyncFolder(file, this.app.vault);

		if (!ethersyncFolder) {
			return;
		}

		const connection = new EthersyncClient(
			[ethersyncFolder, "socket"].join("/"),
			"file://" + [vaultPath, file.path].join("/"),
			this.handleUserCursor.bind(this),
		);

		this.editors.set(file.path, {
			connection,
			userCursors: new Map(),
		});
	}

	private getActiveEditorView(): EditorView | null {
		const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (!mdView) return null;

		// @ts-ignore to bypass type mismatch
		return ((mdView.editor as any).cm as EditorView) ?? null;
	}
}
