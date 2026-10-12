import { app, BrowserWindow, ipcMain, nativeTheme, dialog, shell } from 'electron'
import * as fs from 'fs'
import * as crypto from 'crypto'
import process = require('process')
import path = require('path')
import child_process = require('child_process')
import { scanDirectory } from '$src/electron/storageScanner'
import { saveFileMetadata, getAllFiles } from '$src/electron/storageDatabase'
import { AppMenu } from '$src/electron/appMenus'
import { isLinux } from '$src/electron/osSupport'
import { WindowSettings } from '$src/electron//windowSettings'
import { Remote } from '$src/electron/remote'
import { KeyboardLayoutMap, ReactiveProperties } from '$src/types'
import * as http from 'http'

const askLocalAI = async (question: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: 'qwen3:1.7b',
            messages: [
                {
                    role: 'system',
                    content: `You are the AI assistant for StorageOS, a Windows desktop file management application.

Your job is to help users understand and use the features that are actually implemented in this application.

Understand natural language even when the user makes spelling mistakes, grammatical errors, or uses incomplete or informal sentences.

Known capabilities include:
- Searching and filtering indexed files.
- Viewing storage usage and file categories.
- Finding large files.
- Finding files that have not been modified recently.
- Detecting duplicate files.
- Viewing file locations and metadata.

Rules:
- Never invent features. Do not claim the application supports cloud integration, backup and restore, tags, or automatic cleanup unless those features are verified in the application.
- Never claim you searched, opened, moved, renamed, or deleted a file unless a StorageOS tool actually performed that action.
- If a user requests an operation that requires access to actual files, explain that you need to use the appropriate StorageOS tool.
- If a feature is unavailable or uncertain, say so honestly.
- Give concise, practical answers.`,
                },
                {
                    role: 'user',
                    content: question,
                },
            ],
            stream: false,
        })

        const request = http.request(
            {
                hostname: '127.0.0.1',
                port: 11434,
                path: '/api/chat',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
            },
            (response) => {
                let responseBody = ''

                response.setEncoding('utf8')
                response.on('data', (chunk: string) => {
                    responseBody += chunk
                })

                response.on('end', () => {
                    if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
                        reject(new Error(`Ollama returned HTTP ${response.statusCode}: ${responseBody}`))
                        return
                    }

                    try {
                        const data = JSON.parse(responseBody) as {
                            message?: { content?: string }
                        }

                        const answer = data.message?.content?.trim()

                        if (!answer) {
                            reject(new Error('Ollama returned an empty answer.'))
                            return
                        }

                        resolve(answer)
                    } catch (error) {
                        reject(error)
                    }
                })
            },
        )

        request.setTimeout(120000, () => {
            request.destroy(new Error('Ollama request timed out.'))
        })

        request.on('error', reject)
        request.write(body)
        request.end()
    })
}

const ENV_E2E = !!process.env.E2E
const HTML_PATH = `${__dirname}/index.html`

const ElectronApp = {
    mainWindow: null as Electron.BrowserWindow,
    devWindow: null as Electron.BrowserWindow,
    appMenu: null as AppMenu,
    cleanupCounter: 0,
    forceExit: false,

    init(): void {
        app.on('ready', () => this.onReady())

        app.on('before-quit', (e) => {
            console.log('before quit')
            if (!this.forceExit) {
                console.log('no forceExit, sending exitRequest to renderer')
                e.preventDefault()
                this.mainWindow.webContents.send('exitRequest')
            } else {
                console.log('forceExit is true, calling cleanupAndExit')
                this.cleanupAndExit()
            }
        })

        app.on('activate', () => {
            if (this.mainWindow) {
                this.mainWindow.restore()
            }
        })

        process.on('SIGINT', () => {
            console.log('*** BREAK')
            this.forceExit = true
        })
    },

    async createMainWindow(): Promise<void> {
        console.log('Create Main Window')
        await Remote.init()

        this.mainWindow = new BrowserWindow({
            title: 'StorageOS',
            minWidth: WindowSettings.DEFAULTS.minWidth,
            minHeight: WindowSettings.DEFAULTS.minHeight,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
            icon: (isLinux && path.join(__dirname, 'icon.png')) || undefined,
        })

        const settings = WindowSettings.getSettings(this.mainWindow.id)
        console.log('settings', settings.x)

        settings.manage(this.mainWindow)
        this.mainWindow.setBounds({
            width: settings.width,
            height: settings.height,
            x: settings.x || this.mainWindow.getBounds().x,
            y: settings.y || this.mainWindow.getBounds().y,
        })

        if (!settings.custom) {
            console.log('custom settings not found: resetting')
            settings.custom = {
                splitView: false,
            }
        }

        this.openDevTools()

        this.mainWindow.on('close', (e: Event) => {
            console.log('on:close')
            if (!this.forceExit) {
                console.log('exit request and no force: sending back exitRequest')
                e.preventDefault()
                this.mainWindow.webContents.send('exitRequest')
            } else {
                console.log('forceExit: let go exit event')
            }
        })

        this.mainWindow.on('minimize', () => {
            this.mainWindow.minimize()
        })

        this.appMenu = new AppMenu(this.mainWindow)
        this.mainWindow.loadFile(HTML_PATH)
    },

    installReactDevTools(): void {
        console.log('Install React DevTools')

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { default: installExtension, REACT_DEVELOPER_TOOLS } = require('electron-devtools-installer')

        installExtension(REACT_DEVELOPER_TOOLS)
            .then((name: string) => console.log(`Added Extension: ${name}`))
            .catch((err: Error) => console.log('An error occurred: ', err))
    },

    async reloadApp(): Promise<void> {
        const mainWindow = this.mainWindow

        if (mainWindow) {
            await mainWindow.webContents.session.clearCache()
            mainWindow.webContents.reloadIgnoringCache()
        }
    },

    installIpcMainListeners() {
        console.log('Install ipcMain Listeners')

        ipcMain.on('reloadIgnoringCache', () => this.reloadApp())

        // Get disk information.
        ipcMain.handle('getDiskInfo', async () => {
            return new Promise((resolve, reject) => {
                child_process.exec(
                    'powershell.exe -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Where-Object {$_.DriveType -eq 3} | Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json -Compress"',
                    (error, stdout) => {
                        if (error) {
                            reject(error)
                            return
                        }

                        try {
                            const result = JSON.parse(stdout.trim())
                            const disks = Array.isArray(result) ? result : [result]

                            resolve(
                                disks.map((disk) => {
                                    const total = Number(disk.Size)
                                    const available = Number(disk.FreeSpace)
                                    const used = total - available

                                    return {
                                        mounted: disk.DeviceID,
                                        total,
                                        used,
                                        available,
                                        capacity: total > 0 ? `${((used / total) * 100).toFixed(1)}%` : '0%',
                                    }
                                }),
                            )
                        } catch (parseError) {
                            reject(parseError)
                        }
                    },
                )
            })
        })

        // Find the ten largest files in a selected folder.
        ipcMain.handle('scanLargestFiles', async () => {
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory'],
                title: 'Select Folder to Analyze',
            })

            if (result.canceled || result.filePaths.length === 0) {
                return []
            }

            const rootPath = result.filePaths[0]
            const files: Array<{
                name: string
                path: string
                size: number
            }> = []
            const folders = [rootPath]

            while (folders.length > 0) {
                const currentFolder = folders.pop()
                if (!currentFolder) continue

                try {
                    const entries = await fs.promises.readdir(currentFolder, {
                        withFileTypes: true,
                    })

                    for (const entry of entries) {
                        const fullPath = path.join(currentFolder, entry.name)

                        try {
                            if (entry.isDirectory()) {
                                folders.push(fullPath)
                            } else if (entry.isFile()) {
                                const stats = await fs.promises.stat(fullPath)
                                files.push({
                                    name: entry.name,
                                    path: fullPath,
                                    size: stats.size,
                                })
                            }
                        } catch {
                            // Ignore inaccessible files.
                        }
                    }
                } catch {
                    // Ignore inaccessible folders.
                }
            }

            return files.sort((a, b) => b.size - a.size).slice(0, 10)
        })

        // Analyze storage usage by file category.
        ipcMain.handle('scanStorageCategories', async () => {
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory'],
                title: 'Analyze Storage by Category',
            })

            if (result.canceled || result.filePaths.length === 0) {
                return null
            }

            const rootPath = result.filePaths[0]
            const categories: Record<string, number> = {
                Images: 0,
                Videos: 0,
                Documents: 0,
                Audio: 0,
                Archives: 0,
                Applications: 0,
                Code: 0,
                Other: 0,
            }

            const categoryExtensions: Record<string, string[]> = {
                Images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'],
                Videos: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm'],
                Documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv'],
                Audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg'],
                Archives: ['.zip', '.rar', '.7z', '.tar', '.gz'],
                Applications: ['.exe', '.msi'],
                Code: ['.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.c', '.cpp', '.html', '.css', '.json'],
            }

            const folders = [rootPath]

            while (folders.length > 0) {
                const currentFolder = folders.pop()
                if (!currentFolder) continue

                try {
                    const entries = await fs.promises.readdir(currentFolder, {
                        withFileTypes: true,
                    })

                    for (const entry of entries) {
                        const fullPath = path.join(currentFolder, entry.name)

                        try {
                            if (entry.isDirectory()) {
                                folders.push(fullPath)
                            } else if (entry.isFile()) {
                                const stats = await fs.promises.stat(fullPath)
                                const extension = path.extname(entry.name).toLowerCase()
                                let category = 'Other'

                                for (const [categoryName, extensions] of Object.entries(categoryExtensions)) {
                                    if (extensions.includes(extension)) {
                                        category = categoryName
                                        break
                                    }
                                }

                                categories[category] += stats.size
                            }
                        } catch {
                            // Ignore inaccessible files.
                        }
                    }
                } catch {
                    // Ignore inaccessible folders.
                }
            }

            return categories
        })

        // Scan a folder and save file metadata to the database.
        ipcMain.handle('scanFileMetadata', async () => {
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory'],
                title: 'Select Folder to Analyze',
            })

            if (result.canceled || result.filePaths.length === 0) {
                return []
            }

            const rootPath = result.filePaths[0]
            const files = await scanDirectory(rootPath)
            await saveFileMetadata(files)
            return files
        })

        // Get files already indexed in the database.
        ipcMain.handle('getIndexedFiles', async () => {
            return getAllFiles()
        })

        // Open a file from the AI Assistant results.
        ipcMain.handle('openStorageFile', async (_event, filePath: string) => {
            if (!filePath || typeof filePath !== 'string') {
                return { success: false, error: 'Invalid file path.' }
            }

            try {
                const errorMessage = await shell.openPath(filePath)

                if (errorMessage) {
                    return { success: false, error: errorMessage }
                }

                return { success: true }
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unable to open the file.',
                }
            }
        })

        ipcMain.handle('askStorageAssistant', async (_event, question: string) => {
            const files = await getAllFiles()
            console.log('Indexed file count:', files.length)
            console.log(
                'PDF files:',
                files
                    .filter(
                        (file) =>
                            file.name.toLowerCase().endsWith('.pdf') ||
                            (file.extension || '').toLowerCase() === '.pdf' ||
                            (file.extension || '').toLowerCase() === 'pdf',
                    )
                    .map((file) => ({ name: file.name, extension: file.extension }))
                    .slice(0, 10),
            )
            const query = String(question || '')
                .trim()
                .toLowerCase()

            if (!query) {
                return { answer: 'Please enter a question about your storage.' }
            }

            const formatBytes = (bytes: number): string => {
                if (bytes < 1024) return `${bytes} B`
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
                if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
                return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
            }

            const toResult = (file: (typeof files)[number]) => ({
                name: file.name,
                path: file.path,
                size: file.size,
                category: file.category || 'Other',
                modifiedAt: file.modifiedAt,
            })

            const totalSize = files.reduce((sum, file) => sum + file.size, 0)

            // Find files by name, extension, or location.
            if (/\b(find|search|locate|where|show|list|get)\b/.test(query)) {
                const stopWords = new Set([
                    'find',
                    'search',
                    'locate',
                    'where',
                    'show',
                    'list',
                    'get',
                    'my',
                    'me',
                    'the',
                    'a',
                    'an',
                    'all',
                    'for',
                    'in',
                    'on',
                    'of',
                    'with',
                    'file',
                    'files',
                    'document',
                    'documents',
                    'named',
                    'called',
                    'please',
                    'can',
                    'you',
                    'i',
                    'want',
                    'to',
                    'from',
                    'folder',
                    'type',
                    'extension',
                ])

                const terms = query
                    .replace(/[^\w.\- ]/g, ' ')
                    .split(/\s+/)
                    .filter((term) => term.length > 1 && !stopWords.has(term))

                const matches = files.filter((file) => {
                    const searchable = `${file.name} ${file.path} ${file.extension || ''}`.toLowerCase()

                    return (
                        terms.length > 0 &&
                        terms.some((term) => {
                            if (['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx', 'txt'].includes(term)) {
                                const extension = (file.extension || '').toLowerCase()
                                return (
                                    extension === `.${term}` ||
                                    extension === term ||
                                    file.name.toLowerCase().endsWith(`.${term}`)
                                )
                            }

                            return searchable.includes(term)
                        })
                    )
                })

                return {
                    answer: matches.length
                        ? `Found ${matches.length} indexed files matching your search.`
                        : 'No indexed files matched those search terms. Try a different filename, keyword, or extension.',
                    files: matches.slice(0, 100).map(toResult),
                }
            }

            // Find files that have not been modified recently.
            if (/\b(old|older|inactive|unused|recently|modified)\b/.test(query)) {
                const daysMatch = query.match(/\b(\d+)\s*days?\b/)
                const days = Number(daysMatch?.[1] || 90)
                const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
                const oldFiles = files
                    .filter((file) => file.modifiedAt > 0 && file.modifiedAt < cutoff)
                    .sort((a, b) => a.modifiedAt - b.modifiedAt)
                return {
                    answer: `Found ${oldFiles.length} indexed files not modified in the last ${days} days.`,
                    files: oldFiles.slice(0, 100).map(toResult),
                }
            }
            // Find the largest files.
            if (/\b(largest|biggest|top)\b/.test(query)) {
                const match = query.match(/\b(\d+)\b/)
                const limit = Math.min(Number(match?.[1] || 10), 100)
                const largest = [...files].sort((a, b) => b.size - a.size).slice(0, limit)

                return {
                    answer: `Your ${largest.length} largest indexed files occupy ${formatBytes(
                        largest.reduce((sum, file) => sum + file.size, 0),
                    )}.`,
                    files: largest.map(toResult),
                }
            }

            // Find image files.
            if (/\b(images?|photos?|pictures?)\b/.test(query)) {
                const imageExtensions = new Set([
                    '.jpg',
                    '.jpeg',
                    '.png',
                    '.gif',
                    '.bmp',
                    '.webp',
                    '.svg',
                    '.tif',
                    '.tiff',
                    '.heic',
                ])

                const imageFiles = files.filter((file) => {
                    const extension = (file.extension || '').toLowerCase()
                    return imageExtensions.has(extension.startsWith('.') ? extension : `.${extension}`)
                })

                const imageSize = imageFiles.reduce((sum, file) => sum + file.size, 0)

                return {
                    answer: `I found ${imageFiles.length} indexed image files using ${formatBytes(imageSize)}.`,
                    files: imageFiles.slice(0, 100).map(toResult),
                }
            }

            // Find files larger than a specified size.
            const sizeMatch = query.match(
                /\b(?:larger|bigger|greater|over|above|exceeding)\s+(?:than\s+)?(\d+(?:\.\d+)?)\s*(kb|mb|gb|bytes?)\b/,
            )

            if (sizeMatch) {
                const amount = Number(sizeMatch[1])
                const unit = sizeMatch[2]
                const multiplier = unit.startsWith('g')
                    ? 1024 ** 3
                    : unit.startsWith('m')
                    ? 1024 ** 2
                    : unit.startsWith('k')
                    ? 1024
                    : 1

                const threshold = amount * multiplier
                const matches = files.filter((file) => file.size > threshold).sort((a, b) => b.size - a.size)

                return {
                    answer: `Found ${matches.length} indexed files larger than ${sizeMatch[1]} ${unit}.`,
                    files: matches.slice(0, 100).map(toResult),
                }
            }

            // Show storage usage by category.
            if (/\b(category|categories|storage by type|breakdown)\b/.test(query)) {
                const categories = new Map<string, { count: number; size: number }>()

                for (const file of files) {
                    const category = file.category || 'Other'
                    const current = categories.get(category) || { count: 0, size: 0 }
                    current.count++
                    current.size += file.size
                    categories.set(category, current)
                }

                const breakdown = [...categories.entries()]
                    .sort((a, b) => b[1].size - a[1].size)
                    .map(([category, data]) => `${category}: ${data.count} files, ${formatBytes(data.size)}`)

                return {
                    answer: breakdown.length
                        ? `Storage breakdown:\n${breakdown.join('\n')}`
                        : 'No indexed files were found.',
                }
            }

            // Find older files.
            if (/\b(old|older|inactive|unused)\b/.test(query)) {
                const daysMatch = query.match(/\b(\d+)\s+days?\b/)
                const days = Number(daysMatch?.[1] || 90)
                const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

                const oldFiles = files
                    .filter((file) => Number(file.modifiedAt) < cutoff)
                    .sort((a, b) => Number(a.modifiedAt) - Number(b.modifiedAt))

                return {
                    answer: `Found ${oldFiles.length} indexed files not modified in the last ${days} days.`,
                    files: oldFiles.slice(0, 100).map(toResult),
                }
            }

            // Report total indexed storage.
            if (/\b(total|overall|how much|space used|storage used|indexed storage)\b/.test(query)) {
                return {
                    answer: `Your index contains ${files.length} files using ${formatBytes(totalSize)} in total.`,
                }
            }

            try {
                const answer = await askLocalAI(question)
                return { answer }
            } catch (error) {
                console.error('StorageOS local AI error:', error)

                const errorMessage = error instanceof Error ? error.message : String(error)

                return {
                    answer: `Local AI error: ${errorMessage}`,
                }
            }
        })

        // Find exact duplicate files using SHA-256 hashes.
        // Files are grouped by size first to avoid unnecessary hashing.
        ipcMain.handle('findDuplicateFiles', async () => {
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory'],
                title: 'Select Folder to Scan for Duplicates',
            })

            if (result.canceled || result.filePaths.length === 0) {
                return []
            }

            const rootPath = result.filePaths[0]
            const scannedFiles = await scanDirectory(rootPath)
            await saveFileMetadata(scannedFiles)

            const indexedFiles = scannedFiles
            const filesBySize = new Map<number, typeof indexedFiles>()
            for (const file of indexedFiles) {
                if (file.isDirectory || file.size <= 0) continue

                const sameSizeFiles = filesBySize.get(file.size) || []
                sameSizeFiles.push(file)
                filesBySize.set(file.size, sameSizeFiles)
            }

            // Only files whose sizes match can be duplicates.
            const candidates: typeof indexedFiles = []

            for (const group of filesBySize.values()) {
                if (group.length > 1) {
                    candidates.push(...group)
                }
            }

            const duplicateGroups = new Map<
                string,
                {
                    hash: string
                    size: number
                    files: Array<{
                        name: string
                        path: string
                        modifiedAt: number
                    }>
                }
            >()

            let checked = 0
            const total = candidates.length
            const batchSize = 4

            const sendProgress = (): void => {
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send('duplicateScanProgress', {
                        checked,
                        total,
                        percent: total > 0 ? Math.round((checked / total) * 100) : 100,
                    })
                }
            }

            // Send initial progress so the renderer knows the scan has started.
            sendProgress()

            const hashFile = (filePath: string): Promise<string> =>
                new Promise((resolve, reject) => {
                    const hash = crypto.createHash('sha256')
                    const stream = fs.createReadStream(filePath)

                    stream.on('data', (chunk) => hash.update(chunk))
                    stream.on('error', reject)
                    stream.on('end', () => resolve(hash.digest('hex')))
                })

            // Hash a limited batch concurrently to avoid opening too many files.
            for (let start = 0; start < candidates.length; start += batchSize) {
                const batch = candidates.slice(start, start + batchSize)

                await Promise.all(
                    batch.map(async (file: (typeof indexedFiles)[number]) => {
                        try {
                            const hash = await hashFile(file.path)
                            const groupKey = `${file.size}:${hash}`
                            const existingGroup = duplicateGroups.get(groupKey)

                            const duplicateFile = {
                                name: file.name,
                                path: file.path,
                                modifiedAt: file.modifiedAt,
                            }

                            if (existingGroup) {
                                existingGroup.files.push(duplicateFile)
                            } else {
                                duplicateGroups.set(groupKey, {
                                    hash,
                                    size: file.size,
                                    files: [duplicateFile],
                                })
                            }
                        } catch {
                            // Ignore files that are missing or inaccessible.
                        } finally {
                            checked++
                        }
                    }),
                )

                // Send progress after every batch.
                sendProgress()
            }

            return Array.from(duplicateGroups.values())
                .filter((group) => group.files.length > 1)
                .sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1))
        })

        // Move an indexed file to the operating system's Recycle Bin.
        // The file is not permanently deleted.
        ipcMain.handle(
            'moveDuplicateToTrash',
            async (_event, filePath: string): Promise<{ success: true; path: string }> => {
                if (typeof filePath !== 'string' || !filePath.trim()) {
                    throw new Error('Invalid file path.')
                }

                const indexedFiles = await getAllFiles()
                const indexedFile = indexedFiles.find((file) => file.path === filePath && !file.isDirectory)

                if (!indexedFile) {
                    throw new Error('This file is not in the storage index. Scan your files again.')
                }

                let stats: fs.Stats

                try {
                    stats = await fs.promises.stat(filePath)
                } catch {
                    throw new Error('This file no longer exists or cannot be accessed. Scan again.')
                }

                if (!stats.isFile()) {
                    throw new Error('The selected path is not a regular file.')
                }

                await shell.trashItem(filePath)

                return {
                    success: true,
                    path: filePath,
                }
            },
        )

        // Exit and cleanup handlers.
        ipcMain.handle('readyToExit', () => {
            console.log('readyToExit')
            this.cleanupAndExit()
        })

        ipcMain.handle('openDevTools', () => {
            console.log('should open dev tools')
            this.openDevTools(true)
        })

        ipcMain.handle('openTerminal', (event: Event, cmd: string): Promise<{ code: number; terminal: string }> => {
            return new Promise((resolve) => {
                child_process
                    .exec(cmd, (error: child_process.ExecException) => {
                        resolve({
                            code: (error && error.code) || 0,
                            terminal: cmd,
                        })
                    })
                    .unref()
            })
        })

        ipcMain.handle(
            'updateMenus',
            (
                e: Event,
                strings: Record<string, string>,
                props: ReactiveProperties,
                keyboardLayoutMap: KeyboardLayoutMap,
            ) => {
                if (this.appMenu) {
                    this.appMenu.createMenu(strings, props, keyboardLayoutMap)
                } else {
                    console.log('languageChanged but app not ready :(')
                }
            },
        )

        ipcMain.handle('selectAll', () => {
            if (this.mainWindow) {
                this.mainWindow.webContents.selectAll()
            }
        })

        ipcMain.handle('needsCleanup', () => {
            console.log('needscleanup')
            this.cleanupCounter++
            console.log('needscleanup, counter now:', this.cleanupCounter)
        })

        ipcMain.handle('cleanedUp', () => this.onCleanUp())

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ipcMain.handle('setWindowSettings', (event: Electron.IpcMainInvokeEvent, data: { [key: string]: any }) => {
            const { settings } = data
            const state = WindowSettings.getSettings(event.sender.id)
            state.custom = settings
        })
    },

    installNativeThemeListener(): void {
        nativeTheme.on('updated', () => {
            BrowserWindow.getAllWindows().forEach((window: Electron.BrowserWindow) => {
                window.webContents.send('nativeTheme:updated', nativeTheme.shouldUseDarkColors)
            })
        })
    },

    cleanupAndExit(): void {
        console.log('cleanupAndExit')

        if (this.cleanupCounter) {
            console.log('cleanupCounter non zero', this.cleanupCounter)
            this.mainWindow.webContents.send('cleanup')
        } else {
            console.log('cleanupCount zero: exit')
            app.exit()
        }
    },

    onCleanUp(): void {
        this.cleanupCounter--
        console.log('onCleanUp, counter now', this.cleanupCounter)

        if (!this.cleanupCounter) {
            console.log('cleanupCounter equals to zero, calling app.exit()')
            app.exit()
        } else {
            console.log('cleanupCounter non zero, cancel exit', this.cleanupCounter)
        }
    },

    openDevTools(force = false): void {
        // Spectron problem with DevTools:
        // https://github.com/electron/spectron/issues/254
        if ((!ENV_E2E && window.ENV.NODE_ENV) !== 'production' || force) {
            if (!this.devWindow || this.devWindow.isDestroyed()) {
                const winState = WindowSettings.getDevToolsSettings()

                this.devWindow = new BrowserWindow({
                    width: winState.width,
                    height: winState.height,
                    x: winState.x,
                    y: winState.y,
                })

                winState.manage(this.devWindow)

                this.mainWindow.webContents.setDevToolsWebContents(this.devWindow.webContents)

                this.mainWindow.webContents.openDevTools({ mode: 'detach' })
            } else {
                if (this.devWindow.isMinimized()) {
                    this.devWindow.restore()
                } else {
                    this.devWindow.focus()
                }
            }
        }
    },

    async onReady(): Promise<void> {
        console.log('App Ready')
        this.installIpcMainListeners()
        this.installNativeThemeListener()
        await this.createMainWindow()
    },
}

console.log(`Electron Version ${app.getVersion()}`)
ElectronApp.init()
