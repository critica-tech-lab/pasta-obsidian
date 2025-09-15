import "obsidian";

declare module "obsidian" {
	interface App {
		setting: {
			open: () => Promise<void>;
			openTabById: (id: string) => Promise<void>;
		};
	}
}
