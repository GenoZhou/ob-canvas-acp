import {ItemView, Notice, Plugin} from "obsidian";
import {askQuestionFromCanvasSelection} from "./workflow";
import {CanvasAcpSettings, CanvasAcpSettingTab, DEFAULT_SETTINGS} from "./settings";

export default class CanvasAcpPlugin extends Plugin {
	settings: CanvasAcpSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "ask-question-about-canvas-note",
			name: "Ask question about canvas node",
			checkCallback: (checking: boolean) => {
				const activeView = this.app.workspace.getActiveViewOfType(ItemView);
				const isCanvas = activeView?.getViewType?.() === "canvas";

				if (!isCanvas) {
					return false;
				}

				if (!checking) {
					void askQuestionFromCanvasSelection(this.app, this.settings).catch((error) => {
						new Notice(error instanceof Error ? error.message : "Canvas ACP failed.");
					});
				}

				return true;
			},
		});

		this.addRibbonIcon("message-square-plus", "Ask question about canvas node", () => {
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
