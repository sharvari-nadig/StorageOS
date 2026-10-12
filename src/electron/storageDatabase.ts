import type * as sqlJs from 'sql.js'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { FileMetadata } from '$src/types/storage'

let database: sqlJs.Database | null = null
let databasePath = ''

async function getDatabase(): Promise<sqlJs.Database> {
    if (database) {
        return database
    }

    databasePath = path.join(app.getPath('userData'), 'storageos.db')

    const nodeRequire = eval('require') as NodeRequire
    const initSqlJs = nodeRequire('sql.js')

    const SQL = await initSqlJs({
        locateFile: (file: string) => path.join(__dirname, '../node_modules/sql.js/dist', file),
    })

    if (fs.existsSync(databasePath)) {
        const fileBuffer = fs.readFileSync(databasePath)
        database = new SQL.Database(fileBuffer)
        console.log('StorageOS database loaded:', databasePath)
    } else {
        database = new SQL.Database()
        console.log('Created new StorageOS database:', databasePath)
    }

    const db = database

    db.run(`
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            parentPath TEXT,
            size INTEGER NOT NULL,
            extension TEXT,
            category TEXT,
            modifiedAt INTEGER NOT NULL,
            isDirectory INTEGER NOT NULL DEFAULT 0
        )
    `)

    const tableInfo = db.exec('PRAGMA table_info(files)')

    const hasParentPath = tableInfo.some((result) => result.values.some((row) => row[1] === 'parentPath'))

    if (!hasParentPath) {
        db.run('ALTER TABLE files ADD COLUMN parentPath TEXT')
    }

    saveDatabase()

    return db
}

function saveDatabase(): void {
    if (!database || !databasePath) {
        return
    }

    const data = database.export()

    fs.writeFileSync(databasePath, Buffer.from(data))
}

export async function saveFileMetadata(files: FileMetadata[]): Promise<void> {
    console.log('saveFileMetadata called with files:', files.length)

    if (files.length === 0) {
        console.warn('No files received to save to the database.')
        return
    }

    const db = await getDatabase()

    let statement: sqlJs.Statement | null = null
    let transactionStarted = false

    try {
        db.run('BEGIN TRANSACTION')
        transactionStarted = true

        statement = db.prepare(`
            INSERT OR REPLACE INTO files (
                name,
                path,
                parentPath,
                size,
                extension,
                category,
                modifiedAt,
                isDirectory
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)

        for (const file of files) {
            statement.run([
                file.name,
                file.path,
                file.parentPath || path.dirname(file.path),
                file.size,
                file.extension || '',
                file.category || 'Other',
                file.modifiedAt || 0,
                file.isDirectory ? 1 : 0,
            ])
        }

        statement.free()
        statement = null

        db.run('COMMIT')
        transactionStarted = false

        saveDatabase()

        const result = db.exec('SELECT COUNT(*) AS total FROM files')

        const total = result[0]?.values[0]?.[0] ?? 0

        console.log('Files saved successfully. Total database rows:', total)
    } catch (error) {
        if (statement) {
            statement.free()
            statement = null
        }

        if (transactionStarted) {
            db.run('ROLLBACK')
        }

        console.error('Failed to save file metadata:', error)
        throw error
    }
}

export async function getAllFiles(): Promise<FileMetadata[]> {
    const db = await getDatabase()

    const countStatement = db.prepare('SELECT COUNT(*) AS total FROM files')

    let totalRows = 0

    try {
        countStatement.step()
        totalRows = Number(countStatement.getAsObject().total || 0)
    } finally {
        countStatement.free()
    }

    console.log('Total rows in files table:', totalRows)

    const statement = db.prepare(`
        SELECT
            name,
            path,
            parentPath,
            size,
            extension,
            category,
            modifiedAt,
            isDirectory
        FROM files
        WHERE isDirectory = 0
    `)

    const files: FileMetadata[] = []

    try {
        while (statement.step()) {
            const row = statement.getAsObject()
            const filePath = String(row.path || '')

            files.push({
                name: String(row.name || ''),
                path: filePath,
                parentPath: String(row.parentPath || path.dirname(filePath)),
                size: Number(row.size || 0),
                extension: String(row.extension || ''),
                category: String(row.category || 'Other'),
                modifiedAt: Number(row.modifiedAt || 0),
                isDirectory: Boolean(row.isDirectory),
            })
        }
    } finally {
        statement.free()
    }

    console.log('Indexed file count:', files.length)

    return files
}
