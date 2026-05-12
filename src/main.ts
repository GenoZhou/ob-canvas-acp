import {Notice, Plugin} from "obsidian";
import {askQuestionFromCanvasSelection} from "./workflow";
import {CanvasAcpSettings, CanvasAcpSettingTab, DEFAULT_SETTINGS} from "./settings";

export default class CanvasAcpPlugin extends Plugin {
	settings: CanvasAcpSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "ask-question-about-canvas-note",
			name: "Ask question about canvas note",
			checkCallback: (checking: boolean) => {
				// Obsidian does not expose CanvasView as a typed public view constructor.
				// eslint-disable-next-line @typescript-eslint/no-deprecated
				const activeView = this.app.workspace.activeLeaf?.view as {getViewType?: () => string} | undefined;
				const isCanvas = activeView?.getViewType?.() === "canvas";

				if (!isCanvas) {
					return false;
				}

				if (!checking) {
					void askQuestionFromCanvasSelection(this.app, this.settings);
				}

				return true;
			},
		});

		this.addRibbonIcon("message-square-plus", "Ask question about canvas note", () => {
			void askQuestionFromCanvasSelection(this.app, this.settings).catch((error) => {
				new Notice(error instanceof Error ? error.message : "Canvas ACP failed.");
			});
		});

		this.addSettingTab(new CanvasAcpSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<CanvasAcpSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
