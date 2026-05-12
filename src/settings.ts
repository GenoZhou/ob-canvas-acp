import {App, PluginSettingTab, Setting} from "obsidian";
import CanvasAcpPlugin from "./main";

export interface CanvasAcpSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: CanvasAcpSettings = {
	mySetting: 'default'
}

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
			.setName('Settings #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
