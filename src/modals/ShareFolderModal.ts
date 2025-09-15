import { App, FuzzySuggestModal, TFolder } from "obsidian";

export class ShareFolderModal extends FuzzySuggestModal<TFolder> {
	private ignoreFolders: Set<string>;

	constructor(
		app: App,
		private onChoose: (folder: TFolder) => void,
		ignoreFolders: string[] = [],
	) {
		super(app);
		this.setPlaceholder("Select a folder…");
		this.ignoreFolders = new Set(ignoreFolders);
	}

	getItems(): TFolder[] {
		return this.app.vault
			.getAllFolders(false)
			.filter(
				(folder) =>
					folder.parent?.isRoot() &&
					!this.ignoreFolders.has(folder.path),
			);
	}

	getItemText(folder: TFolder): string {
		return folder.path;
	}

	onChooseItem(folder: TFolder) {
		this.onChoose(folder);
	}
}
