'use strict'
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import {window, commands, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, TextDocument, workspace} from 'vscode'
import { setTimeout } from 'timers'
const WebSocket = require('ws')
import * as child_process from 'child_process'

let serverProcess = null

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    let controller = new WordCounterController()
    context.subscriptions.push(controller)

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    context.subscriptions.push(vscode.commands.registerCommand('extension.mmCodeStart', () => {
        if (serverProcess) {
            serverProcess.kill()
            serverProcess = null
        }

        const binPath = '~/.vscode/extensions/mm-code/mm-code'
        // const binPath = '/Users/komiyamatomoya/develop/vscode/mm-code/mm-code/mm-code'
        serverProcess = child_process.exec(binPath, (error, stdout, stderror) => {
            // if (error) {
            //     vscode.window.showErrorMessage('MM failed to start server.')
            //     if (serverProcess) {
            //         serverProcess.kill()
            //         serverProcess = null
            //     }
            // } else {
            //     controller.startConnect()
            //     vscode.window.showInformationMessage('MM started. using port:8080')
            // }
            // TODO 成功してもエラー判定になっている？
            // サーバーはプロセス動き続けるのでコールバックにこない
            // controller.startConnect()
            // vscode.window.showInformationMessage('MM started. using port:8080')
        });
        // サーバ準備完了を測れないので適当に待つ
        setTimeout(() => {
            controller.startConnect()
        }, 3000)
        vscode.window.showInformationMessage('MM started. using port:8090')
    }))

    context.subscriptions.push(vscode.commands.registerCommand('extension.mmCodeStop', () => {
        controller.stopConnect()
        if (serverProcess) {
            serverProcess.kill()
            serverProcess = null
        }
        vscode.window.showInformationMessage('MM stopped.')
    }))
}

// this method is called when your extension is deactivated
export function deactivate() {
}

class WordCounterController {
    
        private _disposable: Disposable
        private _statusBarItem: StatusBarItem
        private _client
        private _retryLoop: NodeJS.Timer
    
        constructor() {
            this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left)
            this._statusBarItem.show()
            this._setStateRun()
        }
    
        dispose() {
            this.stopConnect()
            this._statusBarItem.dispose()
            if (serverProcess) {
                serverProcess.kill()
                serverProcess = null
            }
        }

        stopConnect() {
            if (this._client) {
                this._client.close()
                this._client = null
            }
            if (this._disposable) {
                this._disposable.dispose()
                this._disposable = null
            }
            if (this._retryLoop) {
                clearTimeout(this._retryLoop)
                this._retryLoop = null
            }
            this._setStateRun()
        }

        startConnect() {
            this.stopConnect()

            let subscriptions: Disposable[] = []
            window.onDidChangeTextEditorSelection(this._onDidChangeTextEditorSelection, this, subscriptions)
            window.onDidChangeActiveTextEditor(this._onDidChangeActiveTextEditor, this, subscriptions)
            workspace.onDidChangeTextDocument(this._onDidChangeTextDocument, this, subscriptions)
            this._disposable = Disposable.from(...subscriptions)
            
            this._client = new WebSocket('ws://localhost:8090/ws')
            this._client.onerror = (e) => {
                console.log('Connection Error', e)
                vscode.window.showErrorMessage('Failed to connect MM server. MM will retry after 3 sec.')
                if (this._retryLoop) {
                    clearTimeout(this._retryLoop)
                    this._retryLoop = null
                }
                this._retryLoop = setTimeout(() => {
                    this.startConnect()
                }, 1000 * 3)
            }
            this._client.onopen = () => {
                console.log('WebSocket Client Connected')
                vscode.window.showInformationMessage('MM Client Connected')
                this._client.send('join ' + JSON.stringify({
                    name: 'room'
                }))
                this._putLatestFile()
            }
            this._client.onclose = () => {
                console.log('WebSocket Client Closed')
            }
            this._client.onmessage = (e) => {
                const data = JSON.parse(e.data)
                const type = data.type
                if (type === 'join') {
                    // 誰か入室
                    this._putLatestFile()
                }
            }

            this._setStateStop()
        }

        private _setStateRun() {
            this._statusBarItem.text = "Run MM"
            this._statusBarItem.command = "extension.mmCodeStart"
        }
        
        private _setStateStop() {
            this._statusBarItem.text = "Stop MM"
            this._statusBarItem.command = "extension.mmCodeStop"
        }

        private _getFileData() {
            // アクティブなエディタを取得
            const editor = window.activeTextEditor
            return {
                fileName: editor ? editor.document.fileName : '',
                text: editor ? editor.document.getText() : ''
            }
        }

        private _putLatestFile(id = "") {
            const data = this._getFileData()
            this._client.send('follow ' + JSON.stringify({
                id: id,
                fileName: data.fileName,
                text: data.text,
            }))
            this._putLine()
        }
        
        private _putLine() {
            // アクティブなエディタを取得
            const editor = window.activeTextEditor
            const lineIndex = editor.selection.anchor.line
            const columnIndex = editor.selection.anchor.character
            const lineText = editor.document.lineAt(lineIndex).text

            this._client.send('line ' + JSON.stringify({
                r: lineIndex,
                c: columnIndex,
                l: lineText
            }))
        }

        private _onDidChangeTextDocument(e1: vscode.TextDocumentChangeEvent) {
            const updates = []
            e1.contentChanges.forEach((e2: vscode.TextDocumentContentChangeEvent) => {
                updates.push({
                    sr: e2.range.start.line,
                    sc: e2.range.start.character,
                    er: e2.range.end.line,
                    ec: e2.range.end.character,
                    t: e2.text
                })
            })

            this._client.send('updates ' + JSON.stringify({
                updates: updates
            }))
        }
    
        private _onDidChangeActiveTextEditor(e: vscode.TextEditor) {
            this._putLatestFile()
        }
        
        private _onDidChangeTextEditorSelection(e: vscode.TextEditorSelectionChangeEvent) {
            this._putLine()
        }
    }