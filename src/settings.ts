import {App, PluginSettingTab, Setting} from "obsidian";
import CanvasAcpPlugin from "./main";

export interface CanvasAcpSettings {
	agentCommand: string;
	agentArgs: string;
	nodeWidth: number;
	nodeHeight: number;
	debugLogging: boolean;
	systemPrompt: string;
}

export const DEFAULT_SETTINGS: CanvasAcpSettings = {
	agentCommand: "",
	agentArgs: "",
	nodeWidth: 420,
	nodeHeight: 260,
	debugLogging: true,
	systemPrompt: "",
};

export class CanvasAcpSettingTab extends PluginSettingTab {
	plugin: CanvasAcpPlugin;

	constructor(app: App, plugin: CanvasAcpPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		new Setting(containerEl)
			.setName("Canvas agent")
			.setHeading();

		new Setting(containerEl)
			.setName("Agent command")
			.setDesc("Path to the configured agent command, for example node or gemini.")
			.addText((text) => text
				.setPlaceholder("/opt/homebrew/bin/node")
				.setValue(this.plugin.settings.agentCommand)
				.onChange(async (value) => {
					this.plugin.settings.agentCommand = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Agent arguments")
			.setDesc("Arguments passed to the command. Example: /path/to/codex-acp")
			.addTextArea((text) => text
				.setPlaceholder("/path/to/acp-adapter")
				.setValue(this.plugin.settings.agentArgs)
				.onChange(async (value) => {
					this.plugin.settings.agentArgs = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Generated node size")
			.setDesc("Width and height for the new canvas note node.")
			.addText((text) => text
				.setPlaceholder("420")
				.setValue(String(this.plugin.settings.nodeWidth))
				.onChange(async (value) => {
					this.plugin.settings.nodeWidth = parseNodeSize(value, 160, DEFAULT_SETTINGS.nodeWidth);
					await this.plugin.saveSettings();
				}))
			.addText((text) => text
				.setPlaceholder("260")
				.setValue(String(this.plugin.settings.nodeHeight))
				.onChange(async (value) => {
					this.plugin.settings.nodeHeight = parseNodeSize(value, 120, DEFAULT_SETTINGS.nodeHeight);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("System prompt")
			.setDesc("Replaces the default base prompt when non-empty. Blank or whitespace-only values fall back to the default behavior.")
			.addTextArea((text) => text
				.setPlaceholder("Enter a custom system prompt...")
				.setValue(this.plugin.settings.systemPrompt)
				.onChange(async (value) => {
					this.plugin.settings.systemPrompt = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Debug logging")
			.setDesc("Print selection, canvas write, and protocol diagnostics to the developer console.")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.debugLogging)
				.onChange(async (value) => {
					this.plugin.settings.debugLogging = value;
					await this.plugin.saveSettings();
				}));
	}
}

export function parseNodeSize(value: string, min: number, fallback: number): number {
	return Math.max(min, Number(value) || fallback);
}
