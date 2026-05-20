import {App, PluginSettingTab, Setting} from "obsidian";
import CanvasAcpPlugin from "./main";
import {DEFAULT_SYSTEM_PROMPT} from "./workflow";

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
			.setDesc("Runs only the executable you configure here (no shell). Use a trusted agent binary, such as node or an absolute path to your adapter.")
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

		const systemPromptSetting = new Setting(containerEl)
			.setName("System prompt")
			.setDesc("Replaces the default base prompt when non-empty. Blank or whitespace-only values fall back to the default.")
			.addExtraButton((button) => button
				.setIcon("reset")
				.setTooltip("Reset to default")
				.onClick(async () => {
					this.plugin.settings.systemPrompt = "";
					await this.plugin.saveSettings();
					textArea.value = "";
				}));

		systemPromptSetting.settingEl.addClass("canvas-acp-system-prompt-setting");

		systemPromptSetting.descEl.createEl("p", {
			cls: "canvas-acp-default-prompt",
			text: `Default: ${DEFAULT_SYSTEM_PROMPT}`,
		});

		const textArea = systemPromptSetting.settingEl.createEl("textarea");
		textArea.classList.add("canvas-acp-system-prompt-textarea");
		textArea.placeholder = "Enter a custom system prompt...";
		textArea.value = this.plugin.settings.systemPrompt;
		textArea.addEventListener("input", () => {
			this.plugin.settings.systemPrompt = textArea.value;
			void this.plugin.saveSettings();
		});

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
