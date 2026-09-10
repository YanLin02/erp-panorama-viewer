const vscode = require('vscode');
const path = require('path');

const SUPPORTED = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_IMAGES = 4;

function isUri(value) {
    return value &&
        typeof value === 'object' &&
        typeof value.scheme === 'string' &&
        typeof value.path === 'string' &&
        typeof value.toString === 'function';
}

function isSupportedImage(uri) {
    return isUri(uri) && SUPPORTED.has(path.extname(uri.path).toLowerCase());
}

function flattenUris(value, out) {
    if (!value) return;
    if (Array.isArray(value)) {
        for (const item of value) flattenUris(item, out);
        return;
    }
    if (isUri(value)) out.push(value);
}

function uniqueImageUris(values) {
    const raw = [];
    flattenUris(values, raw);

    const seen = new Set();
    const result = [];
    for (const uri of raw) {
        if (!isSupportedImage(uri)) continue;
        const key = uri.toString();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(uri);
    }
    return result;
}

function dirnameUri(uri) {
    return uri.with({ path: path.posix.dirname(uri.path) });
}

async function pickImages(canSelectMany) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    return await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany,
        defaultUri: workspaceFolder,
        filters: {
            'Panorama images': ['png', 'jpg', 'jpeg', 'webp']
        },
        title: canSelectMany
            ? 'Select up to 4 ERP panorama images'
            : 'Select an ERP panorama image'
    });
}

async function pickComparisonImages() {
    const picked = uniqueImageUris((await pickImages(true)) || []);
    if (picked.length !== 1) return picked;

    const first = picked[0];
    const folder = dirnameUri(first);

    try {
        const entries = await vscode.workspace.fs.readDirectory(folder);
        const items = entries
            .filter(([name, type]) =>
                type === vscode.FileType.File &&
                SUPPORTED.has(path.extname(name).toLowerCase())
            )
            .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }))
            .map(([name]) => {
                const uri = vscode.Uri.joinPath(folder, name);
                return {
                    label: name,
                    description: uri.toString() === first.toString() ? 'initial selection' : undefined,
                    picked: uri.toString() === first.toString(),
                    uri
                };
            });

        if (items.length <= 1) return picked;

        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: 'Select 2–4 images for synchronized ERP comparison',
            title: 'ERP Panorama: Select comparison images',
            matchOnDescription: true,
            ignoreFocusOut: true
        });

        if (!selected || selected.length === 0) return picked;
        return uniqueImageUris(selected.map((item) => item.uri));
    } catch (error) {
        console.warn('[ERP Panorama Viewer] Could not enumerate sibling images:', error);
        return picked;
    }
}

function escapeHtmlAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/\"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function getHtml(webview, context, imageUris) {
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'viewer.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'viewer.js'));

    const images = imageUris.map((uri) => ({
        name: path.basename(uri.fsPath || uri.path),
        uri: webview.asWebviewUri(uri).toString()
    }));

    const configHtml = images.map((image) =>
        `<div class="erp-image-config" data-name="${escapeHtmlAttr(image.name)}" data-uri="${escapeHtmlAttr(image.uri)}"></div>`
    ).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta
        http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource}; script-src ${webview.cspSource};"
    >
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${cssUri}" rel="stylesheet">
    <title>ERP Panorama Viewer</title>
</head>
<body>
    <header class="toolbar">
        <label class="control">
            <input id="syncViews" type="checkbox" checked>
            <span>Sync views</span>
        </label>

        <label class="control">
            <span>Interpolation</span>
            <select id="filterMode">
                <option value="linear" selected>Linear</option>
                <option value="nearest">Nearest</option>
            </select>
        </label>

        <button id="resetView" type="button">Reset view</button>

        <div id="globalStatus" class="global-status">Starting…</div>
    </header>

    <div id="erpConfig" class="erp-config" aria-hidden="true">${configHtml}</div>
    <main id="grid" class="viewer-grid"></main>

    <script src="${jsUri}"></script>
</body>
</html>`;
}

async function openPanel(context, inputUris) {
    let imageUris = uniqueImageUris(inputUris);

    if (imageUris.length === 0) {
        const picked = await pickImages(false);
        imageUris = uniqueImageUris(picked || []);
    }

    if (imageUris.length === 0) return;

    if (imageUris.length > MAX_IMAGES) {
        vscode.window.showWarningMessage(
            `ERP Panorama Viewer supports up to ${MAX_IMAGES} images at once. Opening the first ${MAX_IMAGES}.`
        );
        imageUris = imageUris.slice(0, MAX_IMAGES);
    }

    const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');
    const roots = [mediaRoot, ...imageUris.map(dirnameUri)];

    const title = imageUris.length === 1
        ? `ERP 360° — ${path.basename(imageUris[0].fsPath || imageUris[0].path)}`
        : `ERP 360° Compare — ${imageUris.length} images`;

    const panel = vscode.window.createWebviewPanel(
        'erpPanorama.viewer',
        title,
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: false,
            localResourceRoots: roots
        }
    );

    panel.webview.html = getHtml(panel.webview, context, imageUris);
}

function activate(context) {
    const openOne = vscode.commands.registerCommand('erpPanorama.open', async (resourceUri) => {
        let uris = uniqueImageUris(resourceUri);

        if (uris.length === 0) {
            const picked = await pickImages(false);
            uris = uniqueImageUris(picked || []);
        }

        await openPanel(context, uris.slice(0, 1));
    });

    const openMany = vscode.commands.registerCommand('erpPanorama.openMany', async (...args) => {
        let uris = uniqueImageUris(args);
        if (uris.length < 2) {
            uris = await pickComparisonImages();
        }
        await openPanel(context, uris);
    });

    const openSelectedComparison = vscode.commands.registerCommand(
        'erpPanorama.openSelectedComparison',
        async (resourceUri, selectedResourceUris) => {
            const source = Array.isArray(selectedResourceUris) && selectedResourceUris.length > 0
                ? selectedResourceUris
                : [resourceUri];
            const uris = uniqueImageUris(source);

            if (uris.length < 2) {
                vscode.window.showWarningMessage(
                    'Select 2–4 PNG/JPG/WebP images in Explorer, then right-click one of the selected files and choose “Open Selected as ERP Comparison”.'
                );
                return;
            }

            await openPanel(context, uris);
        }
    );

    context.subscriptions.push(openOne, openMany, openSelectedComparison);
}

function deactivate() {}

module.exports = { activate, deactivate };
