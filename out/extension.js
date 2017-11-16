'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const vscode_1 = require("vscode");
const timers_1 = require("timers");
const WebSocket = require('ws');
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    let controller = new WordCounterController();
    context.subscriptions.push(controller);
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    context.subscriptions.push(vscode.commands.registerCommand('extension.mmCodeStart', () => {
        controller.startConnect();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.mmCodeStop', () => {
        controller.stopConnect();
        vscode.window.showInformationMessage('MM stopped.');
    }));
}
exports.activate = activate;
// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;
class WordCounterController {
    constructor() {
        this._statusBarItem = vscode_1.window.createStatusBarItem(vscode_1.StatusBarAlignment.Left);
        this._statusBarItem.show();
        this._setStateRun();
    }
    dispose() {
        this.stopConnect();
        this._statusBarItem.dispose();
    }
    stopConnect() {
        if (this._client) {
            this._client.close();
            this._client = null;
        }
        if (this._disposable) {
            this._disposable.dispose();
            this._disposable = null;
        }
        if (this._retryLoop) {
            clearTimeout(this._retryLoop);
            this._retryLoop = null;
        }
        this._setStateRun();
    }
    startConnect() {
        this.stopConnect();
        let subscriptions = [];
        vscode_1.window.onDidChangeTextEditorSelection(this._onDidChangeTextEditorSelection, this, subscriptions);
        vscode_1.window.onDidChangeActiveTextEditor(this._onDidChangeActiveTextEditor, this, subscriptions);
        vscode_1.workspace.onDidChangeTextDocument(this._onDidChangeTextDocument, this, subscriptions);
        this._disposable = vscode_1.Disposable.from(...subscriptions);
        this._client = new WebSocket('ws://localhost:8090/ws');
        this._client.onerror = (e) => {
            console.log('Connection Error', e);
            vscode.window.showErrorMessage('Failed to connect MM server. MM will retry after 3 sec.');
            if (this._retryLoop) {
                clearTimeout(this._retryLoop);
                this._retryLoop = null;
            }
            this._retryLoop = timers_1.setTimeout(() => {
                this.startConnect();
            }, 1000 * 3);
        };
        this._client.onopen = () => {
            console.log('WebSocket Client Connected');
            vscode.window.showInformationMessage('MM Client Connected');
            this._client.send('join ' + JSON.stringify({
                name: 'room'
            }));
            this._putLatestFile();
        };
        this._client.onclose = () => {
            console.log('WebSocket Client Closed');
        };
        this._client.onmessage = (e) => {
            const data = JSON.parse(e.data);
            const type = data.type;
            if (type === 'join') {
                // 誰か入室
                this._putLatestFile();
            }
        };
        this._setStateStop();
    }
    _setStateRun() {
        this._statusBarItem.text = "Run MM";
        this._statusBarItem.command = "extension.mmCodeStart";
    }
    _setStateStop() {
        this._statusBarItem.text = "Stop MM";
        this._statusBarItem.command = "extension.mmCodeStop";
    }
    _getFileData() {
        // アクティブなエディタを取得
        const editor = vscode_1.window.activeTextEditor;
        return {
            fileName: editor ? editor.document.fileName : '',
            text: editor ? editor.document.getText() : ''
        };
    }
    _putLatestFile(id = "") {
        const data = this._getFileData();
        this._client.send('follow ' + JSON.stringify({
            id: id,
            fileName: data.fileName,
            text: data.text,
        }));
        this._putLine();
    }
    _putLine() {
        // アクティブなエディタを取得
        const editor = vscode_1.window.activeTextEditor;
        if (editor) {
            const lineIndex = editor.selection.anchor.line;
            const columnIndex = editor.selection.anchor.character;
            const lineText = editor.document.lineAt(lineIndex).text;
            this._client.send('line ' + JSON.stringify({
                r: lineIndex,
                c: columnIndex,
                l: lineText
            }));
        }
    }
    _onDidChangeTextDocument(e1) {
        const updates = [];
        e1.contentChanges.forEach((e2) => {
            updates.push({
                sr: e2.range.start.line,
                sc: e2.range.start.character,
                er: e2.range.end.line,
                ec: e2.range.end.character,
                t: e2.text
            });
        });
        this._client.send('updates ' + JSON.stringify({
            updates: updates
        }));
    }
    _onDidChangeActiveTextEditor(e) {
        this._putLatestFile();
    }
    _onDidChangeTextEditorSelection(e) {
        this._putLine();
    }
}
//# sourceMappingURL=extension.js.map