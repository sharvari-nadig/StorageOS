import React, { useState } from 'react'
import { ipcRenderer } from 'electron'

interface AssistantResponse {
    answer: string
    files?: Array<{
        name: string
        path: string
        size: number
        category: string
        modifiedAt: number
    }>
}

const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const exampleQuestions = [
    'Show my 10 largest files',
    'How much space do images occupy?',
    'Find files larger than 100 MB',
    'Which files have not been modified recently?',
]

const StorageAssistant: React.FC = () => {
    const [question, setQuestion] = useState('')
    const [response, setResponse] = useState<AssistantResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const askQuestion = async (value?: string): Promise<void> => {
        const query = (value ?? question).trim()

        if (!query) {
            setError('Please enter a question about your storage.')
            return
        }

        setQuestion(query)
        setLoading(true)
        setError('')
        setResponse(null)

        try {
            const result = await ipcRenderer.invoke('askStorageAssistant', query)

            if (!result || typeof result.answer !== 'string') {
                throw new Error('The assistant is not connected yet. Complete the Electron integration step.')
            }

            setResponse(result as AssistantResponse)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to process your question.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div
            style={{
                padding: 24,
                maxWidth: 1100,
                margin: '0 auto',
                boxSizing: 'border-box',
                width: '100%',
            }}
        >
            <h1 style={{ marginBottom: 8 }}>AI Storage Assistant</h1>

            <p style={{ color: '#64748b', marginTop: 0 }}>Ask questions about your indexed files and storage usage.</p>

            <div
                style={{
                    display: 'flex',
                    gap: 8,
                    marginTop: 24,
                    marginBottom: 16,
                }}
            >
                <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !loading) {
                            void askQuestion()
                        }
                    }}
                    placeholder="Ask about your storage..."
                    aria-label="Ask about your storage"
                    style={{
                        flex: 1,
                        minWidth: 0,
                        padding: 12,
                        border: '1px solid #cbd5e1',
                        borderRadius: 8,
                        fontSize: 14,
                        boxSizing: 'border-box',
                    }}
                />

                <button
                    onClick={() => void askQuestion()}
                    disabled={loading}
                    style={{
                        padding: '10px 20px',
                        border: 0,
                        borderRadius: 8,
                        background: '#2563eb',
                        color: '#fff',
                        cursor: loading ? 'wait' : 'pointer',
                    }}
                >
                    {loading ? 'Thinking...' : 'Ask'}
                </button>
            </div>

            <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 13, color: '#64748b' }}>Try one of these questions:</p>

                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                    }}
                >
                    {exampleQuestions.map((example) => (
                        <button
                            key={example}
                            onClick={() => void askQuestion(example)}
                            disabled={loading}
                            style={{
                                padding: '8px 12px',
                                border: '1px solid #cbd5e1',
                                borderRadius: 20,
                                background: '#fff',
                                cursor: 'pointer',
                            }}
                        >
                            {example}
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <div
                    role="alert"
                    style={{
                        padding: 12,
                        marginBottom: 16,
                        background: '#fef2f2',
                        color: '#991b1b',
                        borderRadius: 8,
                    }}
                >
                    {error}
                </div>
            )}

            {response && (
                <section
                    aria-live="polite"
                    style={{
                        padding: 20,
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        background: '#f8fafc',
                        minWidth: 0,
                    }}
                >
                    <h2 style={{ fontSize: 18, marginTop: 0 }}>Answer</h2>

                    <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{response.answer}</p>

                    {response.files && response.files.length > 0 && (
                        <div
                            style={{
                                width: '100%',
                                maxWidth: '100%',
                                overflowX: 'auto',
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                background: '#fff',
                            }}
                        >
                            <table
                                style={{
                                    width: '100%',
                                    minWidth: 650,
                                    tableLayout: 'fixed',
                                    borderCollapse: 'collapse',
                                    textAlign: 'left',
                                    fontSize: 13,
                                }}
                            >
                                <colgroup>
                                    <col style={{ width: '29%' }} />
                                    <col style={{ width: '15%' }} />
                                    <col style={{ width: '11%' }} />
                                    <col style={{ width: '32%' }} />
                                    <col style={{ width: '13%' }} />
                                </colgroup>

                                <thead>
                                    <tr style={{ background: '#f1f5f9' }}>
                                        {['File', 'Category', 'Size', 'Path', 'Action'].map((heading) => (
                                            <th
                                                key={heading}
                                                style={{
                                                    padding: '12px 10px',
                                                    borderBottom: '1px solid #cbd5e1',
                                                    fontWeight: 600,
                                                    color: '#334155',
                                                    verticalAlign: 'top',
                                                }}
                                            >
                                                {heading}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>

                                <tbody>
                                    {response.files.map((file, index) => (
                                        <tr
                                            key={file.path}
                                            style={{
                                                background: index % 2 === 0 ? '#ffffff' : '#f8fafc',
                                            }}
                                        >
                                            <td
                                                title={file.name}
                                                style={{
                                                    padding: '12px 10px',
                                                    borderBottom: '1px solid #e2e8f0',
                                                    verticalAlign: 'top',
                                                    overflowWrap: 'anywhere',
                                                    lineHeight: 1.5,
                                                    fontWeight: 500,
                                                    color: '#1e293b',
                                                }}
                                            >
                                                {file.name}
                                            </td>

                                            <td
                                                style={{
                                                    padding: '12px 10px',
                                                    borderBottom: '1px solid #e2e8f0',
                                                    verticalAlign: 'top',
                                                    overflowWrap: 'anywhere',
                                                    lineHeight: 1.5,
                                                    color: '#475569',
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        display: 'inline-block',
                                                        padding: '3px 7px',
                                                        background: '#eff6ff',
                                                        color: '#1d4ed8',
                                                        borderRadius: 5,
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    {file.category}
                                                </span>
                                            </td>

                                            <td
                                                style={{
                                                    padding: '12px 10px',
                                                    borderBottom: '1px solid #e2e8f0',
                                                    verticalAlign: 'top',
                                                    whiteSpace: 'nowrap',
                                                    color: '#334155',
                                                    fontVariantNumeric: 'tabular-nums',
                                                }}
                                            >
                                                {formatBytes(file.size)}
                                            </td>

                                            <td
                                                title={file.path}
                                                style={{
                                                    padding: '12px 10px',
                                                    borderBottom: '1px solid #e2e8f0',
                                                    verticalAlign: 'top',
                                                    overflowWrap: 'anywhere',
                                                    wordBreak: 'break-word',
                                                    lineHeight: 1.5,
                                                    color: '#64748b',
                                                    fontSize: 12,
                                                }}
                                            >
                                                {file.path}
                                            </td>

                                            <td
                                                style={{
                                                    padding: '10px',
                                                    borderBottom: '1px solid #e2e8f0',
                                                    verticalAlign: 'top',
                                                }}
                                            >
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            const result = await ipcRenderer.invoke(
                                                                'openStorageFile',
                                                                file.path,
                                                            )

                                                            if (!result?.success) {
                                                                setError(result?.error || 'Unable to open this file.')
                                                            } else {
                                                                setError('')
                                                            }
                                                        } catch {
                                                            setError('Unable to open this file.')
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '6px 10px',
                                                        border: 'none',
                                                        borderRadius: 6,
                                                        background: '#2563eb',
                                                        color: '#fff',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    Open
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}
        </div>
    )
}

export default StorageAssistant
