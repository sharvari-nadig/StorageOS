import * as fs from 'fs'
import * as path from 'path'
import { FileMetadata } from '$src/types/storage'

const categoryExtensions: Record<string, string[]> = {
    Images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'],

    Videos: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm'],

    Documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv'],

    Audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg'],

    Archives: ['.zip', '.rar', '.7z', '.tar', '.gz'],

    Applications: ['.exe', '.msi'],

    Code: ['.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.c', '.cpp', '.html', '.css', '.json'],
}

function getCategory(extension: string): string {
    for (const [category, extensions] of Object.entries(categoryExtensions)) {
        if (extensions.includes(extension)) {
            return category
        }
    }

    return 'Other'
}

export async function scanDirectory(rootPath: string): Promise<FileMetadata[]> {
    const files: FileMetadata[] = []

    const folders = [rootPath]

    while (folders.length > 0) {
        const currentFolder = folders.pop()

        if (!currentFolder) continue

        try {
            const entries = await fs.promises.readdir(currentFolder, { withFileTypes: true })

            for (const entry of entries) {
                const fullPath = path.join(currentFolder, entry.name)

                try {
                    if (entry.isDirectory()) {
                        folders.push(fullPath)
                        continue
                    }

                    if (!entry.isFile()) continue

                    const stats = await fs.promises.stat(fullPath)

                    const extension = path.extname(entry.name).toLowerCase()

                    files.push({
                        name: entry.name,
                        path: fullPath,
                        parentPath: currentFolder,
                        size: stats.size,
                        extension,
                        category: getCategory(extension),
                        modifiedAt: stats.mtimeMs,
                        isDirectory: false,
                    })
                } catch {
                    // Ignore files that cannot be accessed.
                }
            }
        } catch {
            // Ignore folders that cannot be accessed.
        }
    }

    return files
}
