export class App {}
export class ButtonComponent {
	setButtonText() { return this; }
	setCta() { return this; }
	setIcon() { return this; }
	setTooltip() { return this; }
	onClick() { return this; }
	buttonEl = document.createElement("button");
}
export class ExtraButtonComponent {
	setIcon() { return this; }
	setTooltip() { return this; }
	setDisabled() { return this; }
	onClick() { return this; }
	extraSettingsEl = document.createElement("div");
}
export class Modal {
	contentEl = document.createElement("div");
	open() {}
	close() {}
	onOpen() {}
	onClose() {}
}
export class Notice {
	constructor(_message: string) {}
}
export class Plugin {
	app = new App();
	manifest = {version: "0.0.0"};
	loadData() { return Promise.resolve({}); }
	saveData(_data: unknown) { return Promise.resolve(); }
	addCommand(_cmd: unknown) {}
	addRibbonIcon(_icon: string, _title: string, _callback: () => void) {}
	addSettingTab(_tab: unknown) {}
	registerEvent(_event: unknown) {}
}
export class PluginSettingTab {
	constructor(_app: App, _plugin: Plugin) {}
	containerEl = document.createElement("div");
	display() {}
}
export class Setting {
	settingEl = document.createElement("div");
	infoEl = document.createElement("div");
	nameEl = document.createElement("div");
	descEl = document.createElement("div");
	controlEl = document.createElement("div");
	constructor(_container: HTMLElement) {}
	setName(_name: string) { return this; }
	setDesc(_desc: string) { return this; }
	setClass(_cls: string) { return this; }
	setHeading() { return this; }
	addText(_cb: unknown) { return this; }
	addTextArea(_cb: unknown) { return this; }
	addToggle(_cb: unknown) { return this; }
	addButton(_cb: unknown) { return this; }
	addExtraButton(_cb: unknown) { return this; }
}
export class ItemView {}
