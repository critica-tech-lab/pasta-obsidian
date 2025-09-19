import { App, Menu, TAbstractFile, TFolder } from "obsidian";
import { EthersyncManager } from "../managers/EthersyncManager";
import { PastaSyncSettings } from "../settings";
import { JoinFolderModal } from "../modals/JoinFolderModal";
import { ShareFolderModal } from "../modals/ShareFolderModal";
import { ShareCodeModal } from "../modals/ShareCodeModal";

export class ObsidianManager {
	constructor(
		private app: App,
		private settings: PastaSyncSettings,
		private processManager: EthersyncManager,
		private persistSettings: () => Promise<void>,
		private openSettings: () => Promise<void>,
	) {}

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
					icon.innerHTML = "P";
					item.appendChild(icon);
				}

				icon.className =
					"nav-file-tag" + (folder.enabled ? " enabled" : "");
			} else if (icon) {
				icon.remove();
			}
		});
	}

	handleFileMenu(menu: Menu, file: TAbstractFile) {
		if (file instanceof TFolder && file.parent?.isRoot()) {
			menu.addItem((item) => {
				item.setTitle("Pasta: Open settings").onClick(async () => {
					await this.openSettings();
				});
			});
		}

		if (this.processManager.isManagedFolder(file.path)) {
			if (this.processManager.hasActiveProcess(file.path)) {
				menu.addItem((item) => {
					item.setTitle("Pasta: Disable folder").onClick(async () => {
						await this.processManager.disableFolder(file.path);
						this.decorateFolders();
					});
				});
			} else {
				menu.addItem((item) => {
					item.setTitle("Pasta: Enable folder").onClick(async () => {
						await this.processManager.enableFolder(file.path);
						this.decorateFolders();
					});
				});
			}
		} else if (file instanceof TFolder && file.parent?.isRoot()) {
			menu.addItem((item) => {
				item.setTitle("Pasta: Share folder").onClick(async () => {
					await this.addShareFolder(file.path);
				});
			});
		}
	}

	openJoinFolderModal() {
		new JoinFolderModal(this.app, async (path, code) => {
			this.settings.folders.set(path, {
				mode: "join",
				path,
				enabled: true,
			});

			await this.persistSettings();

			await this.processManager.startFolder(path, { code });

			this.decorateFolders();
		}).open();
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

	private async addShareFolder(path: string) {
		this.settings.folders.set(path, {
			mode: "share",
			path,
			enabled: true,
		});

		await this.persistSettings();

		await this.processManager.startFolder(path, {
			onShareCode: (code) => {
				new ShareCodeModal(this.app, code).open();
			},
		});

		this.decorateFolders();
	}
}
