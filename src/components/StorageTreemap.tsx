import React, { useEffect, useState } from 'react'
import { ipcRenderer } from 'electron'
import { FileMetadata } from '$src/types/storage'

type ItemKind = 'category' | 'folder' | 'file'

interface TreemapItem {
    label: string
    size: number
    files: FileMetadata[]
    kind: ItemKind
    path?: string
}

interface Rectangle extends TreemapItem {
    x: number
    y: number
    width: number
    height: number
}

interface FolderBreadcrumb {
    label: string
    path: string
}

function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)

    return `${(bytes / Math.pow(1024, index)).toFixed(2)} ${units[index]}`
}

function normalizePath(value: string): string {
    return value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function getFolderName(folderPath: string): string {
    const cleaned = folderPath.replace(/[\\/]+$/, '')
    const parts = cleaned.split(/[\\/]/)
    return parts[parts.length - 1] || cleaned
}

function isInsideFolder(filePath: string, folderPath: string): boolean {
    const file = normalizePath(filePath)
    const folder = normalizePath(folderPath)

    return file.startsWith(`${folder}/`)
}

function getFolderBreadcrumbs(folderPath: string): FolderBreadcrumb[] {
    const normalized = folderPath.replace(/\\/g, '/')
    const usesBackslashes = folderPath.includes('\\')
    const driveMatch = normalized.match(/^[A-Za-z]:/)

    const prefix = driveMatch ? `${driveMatch[0]}/` : normalized.startsWith('/') ? '/' : ''

    const remainingPath = driveMatch
        ? normalized.slice(2)
        : normalized.startsWith('/')
        ? normalized.slice(1)
        : normalized

    const parts = remainingPath.split('/').filter(Boolean)
    const breadcrumbs: FolderBreadcrumb[] = []
    let currentPath = prefix

    for (const part of parts) {
        if (currentPath && !currentPath.endsWith('/')) {
            currentPath += '/'
        }

        currentPath += part

        breadcrumbs.push({
            label: part,
            path: usesBackslashes ? currentPath.replace(/\//g, '\\') : currentPath,
        })
    }

    return breadcrumbs
}

function createTreemap(items: TreemapItem[], width: number, height: number): Rectangle[] {
    if (items.length === 0) return []

    const totalSize = items.reduce((sum, item) => sum + item.size, 0)

    if (totalSize <= 0) return []

    const rectangles: Rectangle[] = []

    const layout = (
        remainingItems: TreemapItem[],
        x: number,
        y: number,
        availableWidth: number,
        availableHeight: number,
    ): void => {
        if (remainingItems.length === 0) return

        if (remainingItems.length === 1) {
            rectangles.push({
                ...remainingItems[0],
                x,
                y,
                width: availableWidth,
                height: availableHeight,
            })

            return
        }

        const remainingTotal = remainingItems.reduce((sum, item) => sum + item.size, 0)

        if (remainingTotal <= 0) return

        let accumulated = 0
        let splitIndex = 1

        for (let i = 0; i < remainingItems.length; i++) {
            accumulated += remainingItems[i].size

            if (accumulated >= remainingTotal / 2) {
                splitIndex = i + 1
                break
            }
        }

        const firstItems = remainingItems.slice(0, splitIndex)
        const secondItems = remainingItems.slice(splitIndex)

        const firstTotal = firstItems.reduce((sum, item) => sum + item.size, 0)

        const ratio = firstTotal / remainingTotal

        if (availableWidth >= availableHeight) {
            const firstWidth = availableWidth * ratio

            layout(firstItems, x, y, firstWidth, availableHeight)

            layout(secondItems, x + firstWidth, y, availableWidth - firstWidth, availableHeight)
        } else {
            const firstHeight = availableHeight * ratio

            layout(firstItems, x, y, availableWidth, firstHeight)

            layout(secondItems, x, y + firstHeight, availableWidth, availableHeight - firstHeight)
        }
    }

    layout(
        [...items].sort((a, b) => b.size - a.size),
        0,
        0,
        width,
        height,
    )

    return rectangles
}

export default function StorageTreemap() {
    const [files, setFiles] = useState<FileMetadata[]>([])
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
    const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [minSizeMB, setMinSizeMB] = useState('')
    const [maxSizeMB, setMaxSizeMB] = useState('')
    const [selectedExtension, setSelectedExtension] = useState('')
    const [modifiedAfter, setModifiedAfter] = useState('')

    const [hoveredItem, setHoveredItem] = useState<TreemapItem | null>(null)

    useEffect(() => {
        void loadFiles()
    }, [])

    const loadFiles = async (): Promise<void> => {
        try {
            setLoading(true)
            setError(null)

            const scannedFiles = await ipcRenderer.invoke('scanFileMetadata')

            if (!Array.isArray(scannedFiles)) {
                throw new Error('Folder scan returned invalid data.')
            }

            const indexedFiles = await ipcRenderer.invoke('getIndexedFiles')

            if (!Array.isArray(indexedFiles)) {
                throw new Error('Could not reload the storage index.')
            }

            setFiles(indexedFiles)
            setHoveredItem(null)
        } catch (err) {
            console.error('Failed to scan or load indexed files:', err)
            setError(err instanceof Error ? err.message : 'Unable to scan the selected folder.')
        } finally {
            setLoading(false)
        }
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0)

    // Group files into categories.
    const categories = files.reduce<Record<string, TreemapItem>>((result, file) => {
        const category = file.category || 'Other'

        if (!result[category]) {
            result[category] = {
                label: category,
                size: 0,
                files: [],
                kind: 'category',
            }
        }

        result[category].size += file.size
        result[category].files.push(file)

        return result
    }, {})

    const categoryItems = Object.values(categories).sort((a, b) => b.size - a.size)

    const categoryFiles = selectedCategory
        ? files.filter((file) => (file.category || 'Other') === selectedCategory)
        : []

    // At category level, show folders containing files from that category.
    const folderItems: TreemapItem[] = []

    if (selectedCategory && !selectedFolderPath) {
        const folderGroups = new Map<string, FileMetadata[]>()

        for (const file of categoryFiles) {
            const folderPath = file.parentPath || ''

            if (!folderPath) continue

            const key = normalizePath(folderPath)
            const existing = folderGroups.get(key)

            if (existing) {
                existing.push(file)
            } else {
                folderGroups.set(key, [file])
            }
        }

        for (const folderFiles of folderGroups.values()) {
            const folderPath = folderFiles[0].parentPath || ''

            folderItems.push({
                label: getFolderName(folderPath) || folderPath,
                path: folderPath,
                size: folderFiles.reduce((sum, file) => sum + file.size, 0),
                files: folderFiles,
                kind: 'folder',
            })
        }

        // Preserve records from older indexes without parentPath.
        const filesWithoutParent = categoryFiles.filter((file) => !file.parentPath)

        if (filesWithoutParent.length > 0) {
            folderItems.push({
                label: 'Unknown Folder',
                size: filesWithoutParent.reduce((sum, file) => sum + file.size, 0),
                files: filesWithoutParent,
                kind: 'folder',
            })
        }
    }

    // Find files belonging to the selected folder and its descendants.
    const currentFolderFiles = selectedFolderPath
        ? categoryFiles.filter((file) => {
              const parent = file.parentPath || ''

              return (
                  normalizePath(parent) === normalizePath(selectedFolderPath) ||
                  isInsideFolder(parent, selectedFolderPath)
              )
          })
        : []

    const folderContents: TreemapItem[] = []

    if (selectedFolderPath) {
        // Show files directly inside the selected folder.
        const directFiles = currentFolderFiles.filter(
            (file) => normalizePath(file.parentPath || '') === normalizePath(selectedFolderPath),
        )

        for (const file of directFiles) {
            folderContents.push({
                label: file.name,
                size: file.size,
                files: [file],
                kind: 'file',
                path: file.path,
            })
        }

        // Group descendant files by their first-level child folder.
        const childFolders = new Map<string, FileMetadata[]>()

        for (const file of currentFolderFiles) {
            const parent = file.parentPath || ''

            if (!isInsideFolder(parent, selectedFolderPath)) {
                continue
            }

            const normalizedParent = parent.replace(/\\/g, '/')
            const normalizedSelected = selectedFolderPath.replace(/\\/g, '/').replace(/\/+$/, '')

            const relativePath = normalizedParent.slice(normalizedSelected.length).replace(/^\/+/, '')

            const childName = relativePath.split('/')[0]

            if (!childName) continue

            const separator = selectedFolderPath.includes('\\') ? '\\' : '/'
            const childPath = `${selectedFolderPath.replace(/[\\/]+$/, '')}${separator}${childName}`

            const key = normalizePath(childPath)
            const existing = childFolders.get(key)

            if (existing) {
                existing.push(file)
            } else {
                childFolders.set(key, [file])
            }
        }

        for (const childFiles of childFolders.values()) {
            const firstFile = childFiles[0]
            const parent = (firstFile.parentPath || '').replace(/\\/g, '/')
            const root = selectedFolderPath.replace(/\\/g, '/').replace(/\/+$/, '')

            const relative = parent.slice(root.length).replace(/^\/+/, '')

            const childName = relative.split('/')[0]

            if (!childName) continue

            const separator = selectedFolderPath.includes('\\') ? '\\' : '/'
            const childPath = `${selectedFolderPath.replace(/[\\/]+$/, '')}${separator}${childName}`

            folderContents.push({
                label: childName,
                path: childPath,
                size: childFiles.reduce((sum, file) => sum + file.size, 0),
                files: childFiles,
                kind: 'folder',
            })
        }
    }

    const items: TreemapItem[] = !selectedCategory
        ? categoryItems
        : !selectedFolderPath
        ? folderItems
        : folderContents.sort((a, b) => b.size - a.size)

    // Search the current view without changing the navigation location.

    const normalizedSearch = searchQuery.trim().toLowerCase()

    const visibleItems = items
        .map((item) => {
            const matchingFiles = item.files.filter((file) => {
                const sizeMB = file.size / (1024 * 1024)

                if (minSizeMB !== '' && sizeMB < Number(minSizeMB)) {
                    return false
                }

                if (maxSizeMB !== '' && sizeMB > Number(maxSizeMB)) {
                    return false
                }

                if (selectedExtension && (file.extension || '').toLowerCase() !== selectedExtension.toLowerCase()) {
                    return false
                }

                if (modifiedAfter) {
                    const modifiedTime = new Date(file.modifiedAt).getTime()
                    const afterTime = new Date(`${modifiedAfter}T00:00:00`).getTime()

                    if (!Number.isFinite(modifiedTime) || modifiedTime < afterTime) {
                        return false
                    }
                }

                if (normalizedSearch) {
                    const searchableText = [
                        item.label,
                        item.path || '',
                        item.kind,
                        file.name,
                        file.path,
                        file.category,
                        file.extension,
                    ]
                        .join(' ')
                        .toLowerCase()

                    if (!searchableText.includes(normalizedSearch)) {
                        return false
                    }
                }

                return true
            })

            return {
                ...item,
                files: matchingFiles,
                size: matchingFiles.reduce((total, file) => total + file.size, 0),
            }
        })
        .filter((item) => item.files.length > 0)

    const rectangles = createTreemap(visibleItems, 900, 420)

    const navigateToCategory = (category: string): void => {
        setSelectedCategory(category)
        setSelectedFolderPath(null)
        setHoveredItem(null)
        setSearchQuery('')
    }

    const navigateToFolder = (folderPath: string): void => {
        setSelectedFolderPath(folderPath)
        setHoveredItem(null)
        setSearchQuery('')
    }

    const navigateToBreadcrumb = (folderPath: string): void => {
        setSelectedFolderPath(folderPath)
        setHoveredItem(null)
        setSearchQuery('')
    }

    const navigateUp = (): void => {
        if (!selectedFolderPath) {
            setSelectedCategory(null)
            setHoveredItem(null)
            setSearchQuery('')
            return
        }

        const normalized = selectedFolderPath.replace(/[\\/]+$/, '')
        const separatorIndex = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'))

        if (separatorIndex < 0) {
            setSelectedFolderPath(null)
        } else {
            const parent = normalized.slice(0, separatorIndex)

            // Keep a Windows drive root, such as C:\, intact.
            const isDriveRoot = /^[A-Za-z]:$/.test(parent)
            const parentPath = isDriveRoot ? `${parent}\\` : parent

            if (!parentPath || normalizePath(parentPath) === normalizePath(selectedFolderPath)) {
                setSelectedFolderPath(null)
            } else {
                setSelectedFolderPath(parentPath)
            }
        }

        setHoveredItem(null)
        setSearchQuery('')
    }

    if (loading) {
        return <div style={{ padding: 24 }}>Loading storage index...</div>
    }

    return (
        <div
            style={{
                padding: 24,
                background: '#ffffff',
                minHeight: '100%',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 16,
                }}
            >
                <div>
                    <h2 style={{ margin: 0 }}>Storage Treemap</h2>

                    <p style={{ marginTop: 6, color: '#666' }}>Visualize where your storage is being used</p>
                </div>

                <button onClick={() => void loadFiles()} disabled={loading}>
                    Refresh Index
                </button>
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: 24,
                    marginBottom: 20,
                }}
            >
                <div>
                    <strong>{files.length}</strong>
                    <div style={{ color: '#777' }}>Indexed Files</div>
                </div>

                <div>
                    <strong>{formatBytes(totalSize)}</strong>
                    <div style={{ color: '#777' }}>Indexed Storage</div>
                </div>
            </div>

            {error && (
                <div
                    role="alert"
                    style={{
                        marginBottom: 16,
                        padding: 12,
                        color: '#a12622',
                        background: '#fff0ef',
                        borderRadius: 6,
                    }}
                >
                    {error} <button onClick={() => void loadFiles()}>Retry</button>
                </div>
            )}

            {/* Search input */}
            <div
                style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 16,
                    flexWrap: 'wrap',
                }}
            >
                <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => {
                        setSearchQuery(event.target.value)
                        setHoveredItem(null)
                    }}
                    placeholder="Search categories, folders, or files..."
                    aria-label="Search storage items"
                    style={{
                        flex: '1 1 260px',
                        maxWidth: 500,
                        padding: '10px 12px',
                        border: '1px solid #ccc',
                        borderRadius: 6,
                        fontSize: 14,
                    }}
                />

                {searchQuery && <button onClick={() => setSearchQuery('')}>Clear</button>}
            </div>

            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '10px',
                    alignItems: 'center',
                    margin: '12px 0',
                }}
            >
                <input
                    type="number"
                    min="0"
                    placeholder="Min size (MB)"
                    value={minSizeMB}
                    onChange={(e) => setMinSizeMB(e.target.value)}
                    style={{ padding: '8px', width: '130px' }}
                />

                <input
                    type="number"
                    min="0"
                    placeholder="Max size (MB)"
                    value={maxSizeMB}
                    onChange={(e) => setMaxSizeMB(e.target.value)}
                    style={{ padding: '8px', width: '130px' }}
                />

                <select
                    value={selectedExtension}
                    onChange={(e) => setSelectedExtension(e.target.value)}
                    style={{ padding: '8px', minWidth: '150px' }}
                >
                    <option value="">All extensions</option>
                    {[
                        ...new Set(
                            files
                                .map((file) => file.extension)
                                .filter((extension): extension is string => Boolean(extension))
                                .map((extension) => extension.toLowerCase()),
                        ),
                    ]
                        .sort()
                        .map((extension) => (
                            <option key={extension} value={extension}>
                                {extension}
                            </option>
                        ))}
                </select>

                <input
                    type="date"
                    aria-label="Modified after"
                    title="Modified after"
                    value={modifiedAfter}
                    onChange={(e) => setModifiedAfter(e.target.value)}
                    style={{ padding: '8px' }}
                />

                <button
                    onClick={() => {
                        setSearchQuery('')
                        setMinSizeMB('')
                        setMaxSizeMB('')
                        setSelectedExtension('')
                        setModifiedAfter('')
                    }}
                    style={{ padding: '8px 12px', cursor: 'pointer' }}
                >
                    Clear Filters
                </button>
            </div>

            {/* Clickable folder breadcrumbs */}
            {(selectedCategory || selectedFolderPath) && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: 16,
                    }}
                >
                    <button
                        onClick={() => {
                            setSelectedCategory(null)
                            setSelectedFolderPath(null)
                            setHoveredItem(null)
                            setSearchQuery('')
                        }}
                    >
                        All Categories
                    </button>

                    {selectedCategory && (
                        <>
                            <span>/</span>

                            <button
                                onClick={() => {
                                    setSelectedFolderPath(null)
                                    setHoveredItem(null)
                                    setSearchQuery('')
                                }}
                                style={{
                                    fontWeight: selectedFolderPath ? 400 : 600,
                                }}
                            >
                                {selectedCategory}
                            </button>
                        </>
                    )}

                    {selectedFolderPath &&
                        getFolderBreadcrumbs(selectedFolderPath).map((breadcrumb, index, breadcrumbs) => (
                            <React.Fragment key={breadcrumb.path}>
                                <span>/</span>

                                <button
                                    onClick={() => navigateToBreadcrumb(breadcrumb.path)}
                                    style={{
                                        fontWeight: index === breadcrumbs.length - 1 ? 600 : 400,
                                    }}
                                    title={breadcrumb.path}
                                >
                                    {breadcrumb.label}
                                </button>
                            </React.Fragment>
                        ))}

                    {selectedFolderPath && <button onClick={navigateUp}>↑ Parent</button>}
                </div>
            )}

            {visibleItems.length === 0 ? (
                <div
                    style={{
                        padding: 40,
                        textAlign: 'center',
                        border: '1px dashed #ccc',
                        borderRadius: 8,
                    }}
                >
                    {normalizedSearch
                        ? 'No matching categories, folders, or files.'
                        : files.length === 0
                        ? 'No indexed files found. Scan a folder first.'
                        : selectedCategory && !selectedFolderPath
                        ? 'No folder metadata found for this category. Re-scan the folder to populate parent paths.'
                        : selectedFolderPath
                        ? 'No files or subfolders found here.'
                        : 'No indexed files found.'}
                </div>
            ) : (
                <div
                    style={{
                        position: 'relative',
                        width: '100%',
                        overflowX: 'auto',
                    }}
                >
                    <svg
                        viewBox="0 0 900 420"
                        width="100%"
                        height="420"
                        style={{
                            display: 'block',
                            borderRadius: 12,
                            background: '#f5f7fa',
                        }}
                    >
                        {rectangles.map((item, index) => (
                            <g
                                key={`${item.kind}-${item.path || item.label}-${index}`}
                                onMouseEnter={() => setHoveredItem(item)}
                                onMouseLeave={() => setHoveredItem(null)}
                                onClick={() => {
                                    if (item.kind === 'category') {
                                        navigateToCategory(item.label)
                                    } else if (item.kind === 'folder' && item.path) {
                                        navigateToFolder(item.path)
                                    }
                                }}
                                style={{
                                    cursor: item.kind === 'file' ? 'default' : 'pointer',
                                }}
                            >
                                <rect
                                    x={item.x + 2}
                                    y={item.y + 2}
                                    width={Math.max(item.width - 4, 1)}
                                    height={Math.max(item.height - 4, 1)}
                                    rx={6}
                                    fill={
                                        item.kind === 'category'
                                            ? '#3478d4'
                                            : item.kind === 'folder'
                                            ? '#4f8df7'
                                            : '#679bda'
                                    }
                                    opacity={
                                        hoveredItem?.path === item.path && hoveredItem?.label === item.label ? 0.75 : 1
                                    }
                                />

                                {item.width > 80 && item.height > 35 && (
                                    <>
                                        <text
                                            x={item.x + 12}
                                            y={item.y + 28}
                                            fill="white"
                                            fontSize="14"
                                            fontWeight="600"
                                        >
                                            {item.label.length > 18 ? `${item.label.slice(0, 18)}...` : item.label}
                                        </text>

                                        {item.height > 55 && (
                                            <text x={item.x + 12} y={item.y + 50} fill="white" fontSize="12">
                                                {formatBytes(item.size)}
                                            </text>
                                        )}
                                    </>
                                )}
                            </g>
                        ))}
                    </svg>

                    {hoveredItem && (
                        <div
                            style={{
                                position: 'absolute',
                                left: 20,
                                bottom: 20,
                                background: '#222',
                                color: '#fff',
                                padding: '14px 16px',
                                borderRadius: 8,
                                fontSize: 13,
                                pointerEvents: 'none',
                                maxWidth: 450,
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
                                wordBreak: 'break-word',
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 15,
                                    fontWeight: 600,
                                    marginBottom: 8,
                                }}
                            >
                                {hoveredItem.label}
                            </div>

                            <div>Size: {formatBytes(hoveredItem.size)}</div>

                            <div>
                                Type:{' '}
                                {hoveredItem.kind === 'category'
                                    ? 'Category'
                                    : hoveredItem.kind === 'folder'
                                    ? 'Folder'
                                    : hoveredItem.files[0]?.extension || 'Unknown'}
                            </div>

                            {hoveredItem.kind === 'file' && hoveredItem.files[0] && (
                                <div>Modified: {new Date(hoveredItem.files[0].modifiedAt).toLocaleString()}</div>
                            )}

                            {(hoveredItem.path || hoveredItem.files[0]?.path) && (
                                <div
                                    style={{
                                        marginTop: 8,
                                        opacity: 0.75,
                                        wordBreak: 'break-all',
                                    }}
                                >
                                    {hoveredItem.path || hoveredItem.files[0]?.path}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div
                style={{
                    marginTop: 16,
                    color: '#666',
                    fontSize: 13,
                }}
            >
                {normalizedSearch
                    ? `${visibleItems.length} matching item(s) shown. Search filters the current view.`
                    : !selectedCategory
                    ? 'Click a category to explore its folders.'
                    : !selectedFolderPath
                    ? 'Click a folder to explore its files and subfolders.'
                    : 'Explore this folder. Use Parent or the breadcrumbs to navigate back.'}
            </div>
        </div>
    )
}
