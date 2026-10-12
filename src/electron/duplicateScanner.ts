import * as fs from 'fs'
import * as crypto from 'crypto'
import { FileMetadata } from '$src/types/storage'

export interface DuplicateGroup {
    hash: string
    size: number
    files: FileMetadata[]
}

async function calculateFileHash(filePath: string): Promise<string | null> {
    try {
        const hash = crypto.createHash('sha256')
        const stream = fs.createReadStream(filePath)

        return await new Promise((resolve, reject) => {
            stream.on('data', (chunk) => {
                hash.update(chunk)
            })

            stream.on('end', () => {
                resolve(hash.digest('hex'))
            })

            stream.on('error', reject)
        })
    } catch {
        return null
    }
}

export async function findDuplicateFiles(files: FileMetadata[]): Promise<DuplicateGroup[]> {
    const filesBySize = new Map<number, FileMetadata[]>()

    // Step 1: Group files by size.
    for (const file of files) {
        if (file.isDirectory || file.size <= 0) {
            continue
        }

        const existing = filesBySize.get(file.size) || []
        existing.push(file)
        filesBySize.set(file.size, existing)
    }

    const candidateGroups = Array.from(filesBySize.values()).filter((group) => group.length > 1)

    const filesByHash = new Map<string, FileMetadata[]>()

    // Step 2: Hash only files with matching sizes.
    for (const group of candidateGroups) {
        for (const file of group) {
            const hash = await calculateFileHash(file.path)

            if (!hash) {
                continue
            }

            const existing = filesByHash.get(hash) || []
            existing.push(file)
            filesByHash.set(hash, existing)
        }
    }

    // Step 3: Keep only confirmed duplicate groups.
    const duplicates: DuplicateGroup[] = []

    for (const [hash, matchingFiles] of filesByHash) {
        if (matchingFiles.length < 2) {
            continue
        }

        duplicates.push({
            hash,
            size: matchingFiles[0].size,
            files: matchingFiles,
        })
    }

    return duplicates.sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1))
}
