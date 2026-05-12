import {ItemView, Notice, Plugin} from "obsidian";
import {askQuestionFromCanvasSelection} from "./workflow";
import {CanvasAcpSettings, CanvasAcpSettingTab, DEFAULT_SETTINGS} from "./settings";
import {debugError, debugLog, setCanvasAcpDebugLogging} from "./debug";

export default class CanvasAcpPlugin extends Plugin {
	settings: CanvasAcpSettings;

	async onload() {
		await this.loadSettings();
		setCanvasAcpDebugLogging(this.settings.debugLogging);
		debugLog("plugin", "loaded", {
			version: this.manifest.version,
			settings: summarizeSettings(this.settings),
		});

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
						debugError("command", "failed from command palette", error);
						new Notice(error instanceof Error ? error.message : "Canvas ACP failed.");
					});
				}

				return true;
			},
		});

		this.addRibbonIcon("message-square-plus", "Ask question about canvas node", () => {
			debugLog("command", "ribbon command invoked");
			void askQuestionFromCanvasSelection(this.app, this.settings).catch((error) => {
				debugError("command", "failed from ribbon", error);
				new Notice(error instanceof Error ? error.message : "Canvas ACP failed.");
			});
		});

		this.addSettingTab(new CanvasAcpSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<CanvasAcpSettings>);
		setCanvasAcpDebugLogging(this.settings.debugLogging);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		setCanvasAcpDebugLogging(this.settings.debugLogging);
		debugLog("settings", "saved", summarizeSettings(this.settings));
	}
}

function summarizeSettings(settings: CanvasAcpSettings) {
	return {
		hasAgentCommand: settings.agentCommand.length > 0,
		agentCommand: settings.agentCommand,
		agentArgsLength: settings.agentArgs.length,
		outputFolder: settings.outputFolder,
		noteNameTemplate: settings.noteNameTemplate,
		nodeWidth: settings.nodeWidth,
		nodeHeight: settings.nodeHeight,
		debugLogging: settings.debugLogging,
	};
}
