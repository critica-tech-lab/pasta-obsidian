import { App, Modal, Notice, Setting } from "obsidian";

export class ShareCodeModal extends Modal {
	code: string;

	constructor(app: App, code: string) {
		super(app);
		this.code = code;
	}

	onOpen() {
		const { contentEl, titleEl } = this;

		titleEl.setText("Share code");

		new Setting(contentEl)
			.setName("Join Code")
			.setDesc("Click the copy icon or press ⌘/Ctrl+C.")
			.addText((txt) => {
				txt.setValue(this.code);
				txt.inputEl.setAttribute("readonly", "true");

				txt.inputEl.addEventListener("click", () => {
					txt.inputEl.select();
				});
			})
			.addExtraButton((btn) => {
				btn.setIcon("copy")
					.setTooltip("Copy to clipboard")
					.onClick(async () => this.copyToClipboard());
			});

		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText("Close").onClick(() => this.close());
			})
			.addButton((btn) => {
				btn.setButtonText("Copy and close")
					.setCta()
					.onClick(async () => {
						await this.copyToClipboard();
						this.close();
					});
			});
	}

	onClose() {
		this.contentEl.empty();
	}

	private async copyToClipboard() {
		await navigator.clipboard.writeText(this.code);
		new Notice("Copied to clipboard");
	}
}
