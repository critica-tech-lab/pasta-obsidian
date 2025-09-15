import { App, Modal, Setting } from "obsidian";

export class JoinFolderModal extends Modal {
	private code = "";
	private name = "";
	private onSubmit: (name: string, code: string) => void;

	constructor(app: App, onSubmit: (name: string, code: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl, titleEl } = this;

		titleEl.setText("Join a Folder");

		contentEl.createEl("p", {
			text: "Enter your invitation code below to join the shared folder",
		});

		// Enter code
		new Setting(contentEl)
			.setName("Join code")
			.setDesc("Paste or type the code you received")
			.addText((txt) => {
				txt.setPlaceholder("e.g. 1-cool-hash").onChange((val) => {
					this.code = val.trim();
				});

				txt.inputEl.autofocus = true;

				txt.inputEl.addEventListener("keydown", (ev) => {
					if (ev.key === "Enter" && this.code.length > 0) {
						ev.preventDefault();
						this.submit();
					}
				});
			});

		// Folder name
		new Setting(contentEl)
			.setName("Folder name")
			.setDesc("Set a name for the folder to be joined")
			.addText((txt) => {
				txt.setPlaceholder("e.g. Secret Stuff").onChange((val) => {
					this.name = val.trim();
				});

				txt.inputEl.addEventListener("keydown", (ev) => {
					if (ev.key === "Enter" && this.code.length > 0) {
						ev.preventDefault();
						this.submit();
					}
				});
			});

		// Action Buttons
		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText("Cancel").onClick(() => this.close());
			})
			.addButton((btn) => {
				btn.setButtonText("Join")
					.setCta()
					.onClick(() => this.submit());
			});
	}

	private submit() {
		if (!this.code || !this.name) return;
		this.onSubmit(this.name, this.code);
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
