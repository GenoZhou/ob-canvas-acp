import {App, normalizePath, TFile} from "obsidian";
import {CanvasAcpSettings} from "./settings";

interface CanvasNodeData {
	id: string;
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	file?: string;
	text?: string;
}

interface CanvasEdgeData {
	id: string;
	fromNode: string;
	fromSide?: string;
	toNode: string;
	toSide?: string;
	label?: string;
}

interface CanvasData {
	nodes: CanvasNodeData[];
	edges: CanvasEdgeData[];
}

interface CanvasSelectionItem {
	id?: string;
	file?: string;
	data?: Partial<CanvasNodeData>;
}

interface CanvasViewLike {
	file?: TFile;
	getViewType?: () => string;
	canvas?: {
		selection?: Set<CanvasSelectionItem>;
		importData?: (data: CanvasData) => void;
		requestSave?: () => void;
	};
}

export interface SelectedCanvasNote {
	canvasFile: TFile;
	noteFile: TFile;
	node: CanvasNodeData;
	view: CanvasViewLike;
}

export function getActiveCanvasView(app: App): CanvasViewLike {
	// Obsidian does not expose CanvasView as a typed public view constructor.
	// eslint-disable-next-line @typescript-eslint/no-deprecated
	const view = app.workspace.activeLeaf?.view as CanvasViewLike | undefined;
	if (view?.getViewType?.() !== "canvas" || !view.file) {
		throw new Error("Open a canvas and select one note node first.");
	}

	return view;
}

export async function getSelectedCanvasNote(app: App): Promise<SelectedCanvasNote> {
	const view = getActiveCanvasView(app);
	const canvasFile = view.file;
	if (!canvasFile) {
		throw new Error("Open a canvas and select one note node first.");
	}

	const data = await readCanvasData(app, canvasFile);
	const selectedItems = Array.from(view.canvas?.selection ?? []);
	const selectedIds = new Set(selectedItems.map((item) => item.data?.id ?? item.id).filter(Boolean));
	const selectedFiles = new Set(selectedItems.map((item) => item.data?.file ?? item.file).filter(Boolean));

	const selectedNodes = data.nodes.filter((node) => selectedIds.has(node.id) || (node.file && selectedFiles.has(node.file)));
	const fileNodes = selectedNodes.filter((node) => node.type === "file" && node.file);

	if (fileNodes.length !== 1) {
		throw new Error("Select exactly one file node on the active canvas.");
	}

	const selectedNode = fileNodes[0];
	if (!selectedNode?.file) {
		throw new Error("The selected canvas node does not point to a note.");
	}

	const noteFile = app.vault.getAbstractFileByPath(selectedNode.file);
	if (!(noteFile instanceof TFile)) {
		throw new Error("The selected canvas node does not point to an existing note.");
	}

	return {
		canvasFile,
		noteFile,
		node: selectedNode,
		view,
	};
}

export async function addGeneratedNoteToCanvas(
	app: App,
	selection: SelectedCanvasNote,
	newNote: TFile,
	question: string,
	settings: CanvasAcpSettings,
) {
	const data = await readCanvasData(app, selection.canvasFile);
	const sourceNode = data.nodes.find((node) => node.id === selection.node.id);

	if (!sourceNode) {
		throw new Error("The selected canvas node could not be found.");
	}

	const targetNode: CanvasNodeData = {
		id: createCanvasId("node"),
		type: "file",
		file: newNote.path,
		x: sourceNode.x + sourceNode.width + 180,
		y: sourceNode.y,
		width: settings.nodeWidth,
		height: settings.nodeHeight,
	};

	const edge: CanvasEdgeData = {
		id: createCanvasId("edge"),
		fromNode: sourceNode.id,
		fromSide: "right",
		toNode: targetNode.id,
		toSide: "left",
		label: question,
	};

	data.nodes.push(targetNode);
	data.edges.push(edge);

	await app.vault.modify(selection.canvasFile, `${JSON.stringify(data, null, "\t")}\n`);
	selection.view.canvas?.importData?.(data);
	selection.view.canvas?.requestSave?.();
}

async function readCanvasData(app: App, file: TFile): Promise<CanvasData> {
	const raw = await app.vault.read(file);
	const parsed = JSON.parse(raw) as Partial<CanvasData>;
	return {
		nodes: parsed.nodes ?? [],
		edges: parsed.edges ?? [],
	};
}

function createCanvasId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeVaultPath(path: string): string {
	return normalizePath(path).replace(/^\/+/, "");
}
