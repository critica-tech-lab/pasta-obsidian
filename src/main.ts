import {
	App,
	MarkdownView,
	Menu,
	Plugin,
	PluginManifest,
	TAbstractFile,
	TFile,
	TFolder,
	Vault,
} from "obsidian";

import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { ChildProcess } from "child_process";
import { cursorsExtension, getColorForString } from "./editor";
import {
	EthersyncClient,
	ethersyncJoinProcess,
	ethersyncShareProcess,
	hasEthersyncFolder,
	UserCursorMessageParams,
} from "./ethersync";
import { JoinFolderModal } from "./modals/JoinFolderModal";
import { ShareCodeModal } from "./modals/ShareCodeModal";
import { ShareFolderModal } from "./modals/ShareFolderModal";
import {
	PastaSettingsTab,
	PastaSyncSettings,
	PASTA_SYNC_DEFAULT_SETTINGS,
} from "./settings";
import { getVaultBasePath } from "./vault";

export type PastaEditorCursor = {
	from: number;
	to: number;
	label?: string;
	userId: string;
	color: string;
};

type PastaEditor = {
	connection: EthersyncClient;
	userCursors: Map<string, PastaEditorCursor>;
};

export default class PastaSyncPlugin extends Plugin {
	public settings: PastaSyncSettings = PASTA_SYNC_DEFAULT_SETTINGS;
	private processes: Map<string, ChildProcess> = new Map();
	private editors: Map<string, PastaEditor> = new Map();

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
		this.settings = PASTA_SYNC_DEFAULT_SETTINGS;
	}

	private updateCursors: (
		view: EditorView,
		cursors: PastaEditorCursor[],
	) => void;

	async onVaultReady() {
		const vaultBasePath = getVaultBasePath(this.app.vault);

		if (!vaultBasePath) {
			return;
		}

		for (const [id, folder] of this.settings.folders) {
			const ethersyncDir = [vaultBasePath, folder.path].join("/");

			if (folder.enabled) {
				if (folder.mode === "share") {
					await this.shareFolder(id, ethersyncDir);
				} else if (folder.mode === "join") {
					await this.joinFolder(id, ethersyncDir);
				}
			}
		}

		// TODO: improve timeout
		setTimeout(() => {
			this.decorateFolders();
		}, 100);
	}

	async shareFolder(
		id: string,
		path: string,
		onCode?: (code: string) => void,
	) {
		this.processes.set(id, await ethersyncShareProcess(path, onCode));
	}

	async joinFolder(id: string, path: string, code?: string) {
		this.processes.set(id, await ethersyncJoinProcess(path, code));
	}

	async enableFolder(id: string) {
		const { folders } = this.settings;
		const vaultBasePath = getVaultBasePath(this.app.vault);

		if (!vaultBasePath) {
			return;
		}

		const folder = folders.get(id);

		if (!folder) {
			return;
		}

		folders.set(id, { ...folder, enabled: true });
		await this.saveSettings();

		this.decorateFolders();

		const absoluteFolderPath = [vaultBasePath, folder.path].join("/");

		switch (folder.mode) {
			case "share":
				return this.shareFolder(id, absoluteFolderPath);
			case "join":
				return this.joinFolder(id, absoluteFolderPath);
		}
	}

	async disableFolder(id: string) {
		const { folders } = this.settings;
		const folder = folders.get(id);

		if (!folder) {
			return;
		}

		folders.set(id, { ...folder, enabled: false });
		await this.saveSettings();

		this.decorateFolders();

		const process = this.processes.get(id);

		if (process) {
			process.kill();
		}
	}

	// TODO: paint with color if folder is enabled
	decorateFolders() {
		const items =
			document.querySelectorAll<HTMLDivElement>(`.nav-folder-title`);

		items.forEach((item) => {
			const path = item.dataset["path"];

			if (!path || path.contains("/")) {
				return;
			}

			const folder = this.settings.folders.get(path);
			let icon = item.querySelector(".nav-file-tag");

			if (folder) {
				if (!icon) {
					icon = document.createElement("div");
					icon.innerHTML = "Pasta";
					item.appendChild(icon);
				}

				icon.className =
					"nav-file-tag" + (folder.enabled ? " enabled" : "");
			} else {
				if (icon) {
					icon.remove();
				}
			}
		});
	}

	async onQuit() {
		for (const proc of this.processes.values()) {
			proc.kill();
		}
	}

	async onFileMenu(menu: Menu, file: TAbstractFile) {
		const vaultPath = getVaultBasePath(this.app.vault);
		if (!vaultPath) return;

		if (file instanceof TFolder && file.parent?.isRoot) {
			menu.addItem((item) => {
				item.setTitle("Pasta: Open settings").onClick(async () => {
					await this.openSettings();
				});
			});
		}

		if (this.settings.folders.has(file.path)) {
			if (this.processes.has(file.path)) {
				menu.addItem((item) => {
					item.setTitle("Pasta: Disable folder").onClick(async () => {
						await this.disableFolder(file.path);
					});
				});
			} else {
				menu.addItem((item) => {
					item.setTitle("Pasta: Enable folder").onClick(async () => {
						await this.enableFolder(file.path);
					});
				});
			}
		} else {
			if (file instanceof TFolder && file.parent?.isRoot()) {
				menu.addItem((item) => {
					item.setTitle("Pasta: Share folder").onClick(async () => {
						await this.addShareFolder(file.path);
					});
				});
			}
		}
	}

	async openSettings() {
		const setting = this.app.setting;
		await setting.open();
		await setting.openTabById("pasta");
	}

	onCursorChange(
		current: EditorSelection,
		previous: EditorSelection,
		view: EditorView,
	) {
		const markdownView =
			this.app.workspace.getActiveViewOfType(MarkdownView);

		if (!markdownView || !markdownView.file) {
			return;
		}

		const inEthersyncFolder = this.getEthersyncFolder(
			markdownView.file,
			this.app.vault,
		);

		// check if ethersync folder is active

		if (!inEthersyncFolder) {
			console.debug("file not in a Ethersync folder. ignoring...");
			return;
		}

		const folder = markdownView.file.parent;

		if (folder && !this.processes.has(folder.path)) {
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

		if (this.editors.has(markdownView.file.path)) {
			const editor = this.editors.get(markdownView.file.path);

			if (editor) {
				const startLine = view.state.doc.lineAt(currentRange.from);
				const endLine = view.state.doc.lineAt(currentRange.to);

				editor.connection.updateCursor({
					start: {
						line: startLine.number - 1,
						character: currentRange.from - startLine.from,
					},
					end: {
						line: endLine.number - 1,
						character: currentRange.to - endLine.from,
					},
				});
			}
		}
	}

	async getEthersyncFolder(file: TFile, vault: Vault) {
		const vaultPath = getVaultBasePath(this.app.vault);
		if (!vaultPath) return;

		let currentDir = file.parent;

		while (currentDir) {
			if (currentDir.isRoot()) {
				return;
			}

			const currentDirPath = [vaultPath, currentDir.path].join("/");

			if (await hasEthersyncFolder(currentDirPath)) {
				return [currentDirPath, ".ethersync"].join("/");
			}

			currentDir = currentDir.parent;
		}
	}

	onUserCursor(message: UserCursorMessageParams) {
		const view = getActiveEditorView(this.app);
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
			console.warn("remove user id", message.userid);

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

		if (this.editors.has(path)) {
			const editor = this.editors.get(path);

			if (editor) {
				// Remove cursor if range is empty

				const from = posToOffset({
					line: message.ranges[0].start.line,
					ch: message.ranges[0].start.character,
				});

				const to = posToOffset({
					line: message.ranges[0].end.line,
					ch: message.ranges[0].end.character,
				});

				if (from !== undefined && to !== undefined) {
					editor.userCursors.set(message.userid, {
						label: message.name,
						userId: message.userid,
						from,
						to,
						color: getColorForString(message.userid),
					});
				}

				if (this.updateCursors && view) {
					this.updateCursors(
						view,
						Array.from(editor.userCursors.values()),
					);
				}
			}
		}
	}

	async onFileOpen(file?: TFile) {
		const vaultPath = getVaultBasePath(this.app.vault);

		if (!file || !vaultPath) return;

		if (this.editors.has(file.path)) {
			return;
		}

		// TODO: allow nested detection
		const folder = file.parent;

		if (!folder || !this.settings.folders.has(folder.path)) {
			console.warn("ethersync supported, but no process");
			return;
		}

		let retries = 3;

		while (retries > 0) {
			try {
				await this.createEditorConnection(file, vaultPath);
				return;
			} catch (e) {
				console.warn("error attempting to connect:", e);
			}

			retries--;

			await new Promise((resolve) => setTimeout(resolve, 3000));
		}
	}

	async createEditorConnection(file: TFile, vaultPath: string) {
		const content = await this.app.vault.read(file);

		const ethersyncFolder = await this.getEthersyncFolder(
			file,
			this.app.vault,
		);

		if (!ethersyncFolder) {
			return;
		}

		const connection = new EthersyncClient(
			[ethersyncFolder, "socket"].join("/"),
			content,
			"file://" + [vaultPath, file.path].join("/"),
			this.onUserCursor.bind(this),
		);

		this.editors.set(file.path, {
			connection,
			userCursors: new Map(),
		});
	}

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new PastaSettingsTab(this.app, this));

		const { extension, updateCursors } = cursorsExtension({
			onCursorChange: this.onCursorChange.bind(this),
		});

		this.updateCursors = updateCursors;

		this.registerEditorExtension(extension);

		this.addCommand({
			id: "pasta-join-folder",
			name: "Join a folder",
			callback: () => {
				this.openJoinFolderModal();
			},
		});

		this.addCommand({
			id: "pasta-share-folder",
			name: "Share a folder",
			callback: () => {
				this.openShareFolderModal();
			},
		});

		this.addCommand({
			id: "pasta-settings",
			name: "Settings",
			callback: async () => {
				await this.openSettings();
			},
		});

		this.app.workspace.onLayoutReady(this.onVaultReady.bind(this));

		this.app.workspace.on("quit", this.onQuit.bind(this));
		this.app.workspace.on("file-menu", this.onFileMenu.bind(this));
		this.app.workspace.on("file-open", this.onFileOpen.bind(this));
		this.app.workspace.on("layout-change", this.decorateFolders.bind(this));
	}

	openJoinFolderModal() {
		const vaultPath = getVaultBasePath(this.app.vault);
		if (!vaultPath) return;

		new JoinFolderModal(this.app, async (path, code) => {
			this.settings.folders.set(path, {
				mode: "join",
				path,
				enabled: true,
			});

			await this.saveSettings();

			await this.joinFolder(path, [vaultPath, path].join("/"), code);

			this.decorateFolders();
		}).open();
	}

	async addShareFolder(path: string) {
		const vaultPath = getVaultBasePath(this.app.vault);
		if (!vaultPath) return;

		this.settings.folders.set(path, {
			mode: "share",
			path,
			enabled: true,
		});

		await this.saveSettings();

		await this.shareFolder(path, [vaultPath, path].join("/"), (code) => {
			new ShareCodeModal(this.app, code).open();
		});

		this.decorateFolders();
	}

	openShareFolderModal(onShare?: () => void) {
		const ignoreFolders = Array.from(this.settings.folders.keys());

		new ShareFolderModal(
			this.app,
			async (folder) => {
				await this.addShareFolder(folder.path);

				if (onShare) {
					onShare();
				}
			},
			ignoreFolders,
		).open();
	}

	async removeFolder(path: string) {
		this.settings.folders.delete(path);

		await this.saveSettings();

		const process = this.processes.get(path);

		if (process) {
			process.kill();
		}

		this.decorateFolders();
	}

	async loadSettings() {
		const data = await this.loadData();

		console.warn({ data });

		this.settings = Object.assign({}, PASTA_SYNC_DEFAULT_SETTINGS, {
			...data,
			folders: Array.isArray(data.folders)
				? new Map(data.folders)
				: new Map(),
		});
	}

	async saveSettings() {
		const data = {
			...this.settings,
			folders: Array.from(this.settings.folders.entries()),
		};

		await this.saveData(data);
	}
}

function getActiveEditorView(app: App): EditorView | null {
	const mdView = app.workspace.getActiveViewOfType(MarkdownView);

	if (!mdView) return null;

	// Obsidian's editor is a wrapper around CM6
	// `cm` is CodeMirror 6's EditorView
	// ⚠️ not part of the public API, but stable across CM6 versions
	// (in CM5 days it was different)
	// @ts-ignore to bypass type mismatch
	return ((mdView.editor as any).cm as EditorView) ?? null;
}
