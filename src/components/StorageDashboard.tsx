import React, { useEffect, useState } from 'react'
import { ipcRenderer } from 'electron'

interface StorageInfo {
    total: number
    free: number
    used: number
}

interface LargestFile {
    name: string
    path: string
    size: number
}

interface StorageCategories {
    Images: number
    Videos: number
    Documents: number
    Audio: number
    Archives: number
    Applications: number
    Code: number
    Other: number
}

const StorageDashboard: React.FC = () => {
    const [storage, setStorage] = useState<StorageInfo | null>(null)
    const [largestFiles, setLargestFiles] = useState<LargestFile[]>([])
    const [isScanning, setIsScanning] = useState(false)
    const [categories, setCategories] = useState<StorageCategories | null>(null)
    const [isCategoryScanning, setIsCategoryScanning] = useState(false)

    useEffect(() => {
        const calculateStorage = async () => {
            try {
                const disks = await ipcRenderer.invoke('getDiskInfo')

                if (disks && disks.length > 0) {
                    const total = disks.reduce((sum: number, disk: any) => sum + disk.total, 0)

                    const used = disks.reduce((sum: number, disk: any) => sum + disk.used, 0)

                    const free = disks.reduce((sum: number, disk: any) => sum + disk.available, 0)

                    setStorage({
                        total,
                        free,
                        used,
                    })
                }
            } catch (error) {
                console.error('Unable to calculate disk storage:', error)
            }
        }

        calculateStorage()
    }, [])

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes'

        const units = ['Bytes', 'KB', 'MB', 'GB', 'TB']
        const index = Math.floor(Math.log(bytes) / Math.log(1024))

        return `${(bytes / Math.pow(1024, index)).toFixed(2)} ${units[index]}`
    }

    const scanLargestFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files

        if (!files || files.length === 0) {
            return
        }

        setIsScanning(true)
        setLargestFiles([])

        try {
            const scannedFiles: LargestFile[] = []

            for (let i = 0; i < files.length; i++) {
                const file = files[i]

                scannedFiles.push({
                    name: file.name,
                    path: file.webkitRelativePath || file.name,
                    size: file.size,
                })
            }

            scannedFiles.sort((a, b) => b.size - a.size)

            setLargestFiles(scannedFiles.slice(0, 10))
        } catch (error) {
            console.error('Unable to scan files:', error)
        } finally {
            setIsScanning(false)
        }
    }

    const scanStorageCategories = async () => {
        setIsCategoryScanning(true)
        setCategories(null)

        try {
            const result = await ipcRenderer.invoke('scanStorageCategories')

            if (result) {
                setCategories(result)
            }
        } catch (error) {
            console.error('Unable to analyze storage categories:', error)
        } finally {
            setIsCategoryScanning(false)
        }
    }

    const usagePercentage = storage && storage.total > 0 ? ((storage.used / storage.total) * 100).toFixed(1) : '0'

    return (
        <div
            style={{
                padding: '24px',
                margin: '16px',
                borderRadius: '10px',
                background: '#ffffff',
                border: '1px solid #d9d9d9',
            }}
        >
            <h2 style={{ marginTop: 0 }}>StorageOS Dashboard</h2>

            <p style={{ color: '#666' }}>Cross-platform storage monitoring and file analysis</p>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '16px',
                    marginTop: '20px',
                }}
            >
                <div
                    style={{
                        padding: '18px',
                        borderRadius: '8px',
                        background: '#f5f7fa',
                    }}
                >
                    <strong>Total Storage</strong>
                    <div style={{ fontSize: '22px', marginTop: '8px' }}>
                        {storage ? formatBytes(storage.total) : 'Calculating...'}
                    </div>
                </div>

                <div
                    style={{
                        padding: '18px',
                        borderRadius: '8px',
                        background: '#f5f7fa',
                    }}
                >
                    <strong>Used Storage</strong>
                    <div style={{ fontSize: '22px', marginTop: '8px' }}>
                        {storage ? formatBytes(storage.used) : 'Calculating...'}
                    </div>
                </div>

                <div
                    style={{
                        padding: '18px',
                        borderRadius: '8px',
                        background: '#f5f7fa',
                    }}
                >
                    <strong>Free Storage</strong>
                    <div style={{ fontSize: '22px', marginTop: '8px' }}>
                        {storage ? formatBytes(storage.free) : 'Calculating...'}
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '24px' }}>
                <strong>Storage Usage</strong>

                <div
                    style={{
                        height: '12px',
                        background: '#e5e7eb',
                        borderRadius: '6px',
                        marginTop: '10px',
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            width: `${usagePercentage}%`,
                            height: '100%',
                            background: '#2563eb',
                            borderRadius: '6px',
                        }}
                    />
                </div>

                <p style={{ marginBottom: 0 }}>{usagePercentage}% currently used</p>
            </div>

            <div
                style={{
                    marginTop: '28px',
                    paddingTop: '20px',
                    borderTop: '1px solid #e5e7eb',
                }}
            >
                <h3 style={{ marginTop: 0 }}>Storage Breakdown</h3>

                <p style={{ color: '#666' }}>Select a folder to analyze storage usage by file type.</p>

                <button
                    onClick={scanStorageCategories}
                    disabled={isCategoryScanning}
                    style={{
                        padding: '10px 16px',
                        background: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: isCategoryScanning ? 'default' : 'pointer',
                        opacity: isCategoryScanning ? 0.7 : 1,
                    }}
                >
                    {isCategoryScanning ? 'Analyzing...' : 'Analyze Folder'}
                </button>

                {categories && (
                    <div style={{ marginTop: '20px' }}>
                        {Object.entries(categories).map(([category, size]) => {
                            const totalCategorySize = Object.values(categories).reduce((sum, value) => sum + value, 0)

                            const percentage = totalCategorySize > 0 ? (size / totalCategorySize) * 100 : 0

                            return (
                                <div
                                    key={category}
                                    style={{
                                        marginBottom: '16px',
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            marginBottom: '6px',
                                        }}
                                    >
                                        <strong>{category}</strong>
                                        <span>{formatBytes(size)}</span>
                                    </div>

                                    <div
                                        style={{
                                            height: '8px',
                                            background: '#e5e7eb',
                                            borderRadius: '4px',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: `${percentage}%`,
                                                height: '100%',
                                                background: '#2563eb',
                                                borderRadius: '4px',
                                            }}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <div
                style={{
                    marginTop: '28px',
                    paddingTop: '20px',
                    borderTop: '1px solid #e5e7eb',
                }}
            >
                <h3 style={{ marginTop: 0 }}>Largest Files</h3>

                <p style={{ color: '#666' }}>Select a folder to identify the largest files.</p>

                <label
                    style={{
                        display: 'inline-block',
                        padding: '10px 16px',
                        background: '#2563eb',
                        color: '#ffffff',
                        borderRadius: '6px',
                        cursor: 'pointer',
                    }}
                >
                    {isScanning ? 'Scanning...' : 'Select Folder'}

                    <input
                        type="file"
                        {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                        multiple
                        onChange={scanLargestFiles}
                        style={{ display: 'none' }}
                    />
                </label>

                {largestFiles.length > 0 && (
                    <div style={{ marginTop: '20px' }}>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '40px 1fr 120px',
                                gap: '12px',
                                padding: '12px 0',
                                borderBottom: '2px solid #d9d9d9',
                                fontWeight: 600,
                            }}
                        >
                            <div>#</div>
                            <div>File Name / Location</div>
                            <div style={{ textAlign: 'right' }}>Size</div>
                        </div>

                        {largestFiles.map((file, index) => (
                            <div
                                key={`${file.path}-${index}`}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '40px 1fr 120px',
                                    gap: '12px',
                                    padding: '12px 0',
                                    borderBottom: '1px solid #eeeeee',
                                    alignItems: 'center',
                                }}
                            >
                                <strong>{index + 1}</strong>

                                <div style={{ minWidth: 0 }}>
                                    <div
                                        style={{
                                            fontWeight: 500,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {file.name}
                                    </div>

                                    <div
                                        style={{
                                            fontSize: '12px',
                                            color: '#777',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {file.path}
                                    </div>
                                </div>

                                <div style={{ textAlign: 'right', fontWeight: 500 }}>{formatBytes(file.size)}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default StorageDashboard
