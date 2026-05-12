export class App {}
export class ButtonComponent {
	setButtonText() { return this; }
	setCta() { return this; }
	onClick() { return this; }
	buttonEl = document.createElement("button");
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
	constructor(_container: HTMLElement) {}
	setName(_name: string) { return this; }
	setDesc(_desc: string) { return this; }
	setHeading() { return this; }
	addText(_cb: unknown) { return this; }
	addTextArea(_cb: unknown) { return this; }
	addToggle(_cb: unknown) { return this; }
}
export class ItemView {}
