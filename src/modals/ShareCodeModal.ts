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

				txt.inputEl.addEventListener("focus", () => {
					txt.inputEl.select();
				});

				setTimeout(() => {
					txt.inputEl.focus();
					txt.inputEl.select();
				}, 0);
			})
			.addExtraButton((btn) => {
				btn.setIcon("copy")
					.setTooltip("Copy to clipboard")
					.onClick(async () => {
						await navigator.clipboard.writeText(this.code);
						new Notice("Copied to clipboard");
					});
			});

		new Setting(contentEl).addButton((btn) => {
			btn.setButtonText("Close")
				.setCta()
				.onClick(() => this.close());
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
