import React, { useEffect, useCallback, useState, useRef } from 'react'
import { ipcRenderer, webFrame } from 'electron'
import { platform } from 'process'
import { FocusStyleManager, Alert, Classes, Intent } from '@blueprintjs/core'
import classNames from 'classnames'
import { Provider, observer } from 'mobx-react'
import { Trans, useTranslation } from 'react-i18next'
import { isMac } from '$src/utils/platform'
import { SideView } from '$src/components/SideView'
import { Downloads } from '$src/components/Downloads'
import { Nav } from '$src/components/Nav'
import StorageDashboard from '$src/components/StorageDashboard'
import StorageTreemap from '$src/components/StorageTreemap'
import StorageAssistant from '$src/components/StorageAssistant'
import { PrefsDialog } from '$src/components/dialogs/PrefsDialog'
import { ShortcutsDialog } from '$src/components/dialogs/ShortcutsDialog'
import { LeftPanel } from '$src/components/LeftPanel'
import { shouldCatchEvent } from '$src/utils/dom'
import { sendFakeCombo } from '$src/utils/keyboard'
import { MenuAccelerators } from '$src/components/shortcuts/MenuAccelerators'
import { KeyboardHotkeys } from '$src/components/shortcuts/KeyboardHotkeys'
import { useStores } from '$src/hooks/useStores'
import { useEventListener } from '$src/hooks/useEventListener'
import Keys from '$src/constants/keys'
import '@blueprintjs/core/lib/css/blueprint.css'
import '@blueprintjs/icons/lib/css/blueprint-icons.css'
import '@blueprintjs/popover2/lib/css/blueprint-popover2.css'
import '$src/css/main.css'
import '$src/css/windows.css'
import '$src/css/scrollbars.css'
import { reaction } from 'mobx'
import { ReactiveProperties } from '$src/types'
import { triggerUpdateMenus } from '$src/events'
import { PreviewDialog } from './dialogs/PreviewDialog'

interface DuplicateFile {
    name: string
    path: string
    modifiedAt: number
}

interface DuplicateGroup {
    hash: string
    size: number
    files: DuplicateFile[]
}

interface DuplicateScanProgress {
    checked: number
    total: number
    percent: number
}

type AppSection = 'dashboard' | 'analyze' | 'assistant'

const App = observer(() => {
    const { appState } = useStores('appState')
    const { t, i18n } = useTranslation()
    const [isExitDialogOpen, setIsExitDialogOpen] = useState(false)
    const [activeSection, setActiveSection] = useState<AppSection>('dashboard')
    const [showDuplicates, setShowDuplicates] = useState(false)
    const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
    const [duplicateLoading, setDuplicateLoading] = useState(false)
    const [duplicateProgress, setDuplicateProgress] = useState<DuplicateScanProgress>({
        checked: 0,
        total: 0,
        percent: 0,
    })
    const [duplicateError, setDuplicateError] = useState('')
    const [duplicateScanCompleted, setDuplicateScanCompleted] = useState(false)
    const [selectedDuplicatePaths, setSelectedDuplicatePaths] = useState<Set<string>>(new Set())
    const [deletingDuplicates, setDeletingDuplicates] = useState(false)
    const [duplicateStatus, setDuplicateStatus] = useState('')
    const refIsOverlayOpen = useRef(document.body.classList.contains('bp5-overlay-open'))

    const {
        settingsState,
        transferListState: { pendingTransfers, totalTransferProgress },
        isPrefsOpen,
        isShortcutsOpen,
        isExplorer,
    } = appState

    const cache = appState.getActiveCache()
    const progress = (pendingTransfers && totalTransferProgress) || -1

    const formatDuplicateSize = (bytes: number): string => {
        if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size'
        if (bytes < 1024) return `${bytes} B`
        const units = ['KB', 'MB', 'GB', 'TB']
        let size = bytes / 1024
        let unitIndex = 0
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024
            unitIndex++
        }
        return `${size.toFixed(2)} ${units[unitIndex]}`
    }

    useEffect(() => {
        const handleDuplicateScanProgress = (
            _event: Electron.IpcRendererEvent,
            progressUpdate: DuplicateScanProgress,
        ): void => {
            setDuplicateProgress({
                checked: Math.max(0, progressUpdate.checked || 0),
                total: Math.max(0, progressUpdate.total || 0),
                percent: Math.min(100, Math.max(0, progressUpdate.percent || 0)),
            })
        }
        ipcRenderer.on('duplicateScanProgress', handleDuplicateScanProgress)
        return () => {
            ipcRenderer.removeListener('duplicateScanProgress', handleDuplicateScanProgress)
        }
    }, [])

    const scanDuplicates = async (): Promise<void> => {
        const scanStartedAt = Date.now()
        setDuplicateLoading(true)
        setDuplicateProgress({ checked: 0, total: 0, percent: 0 })
        setDuplicateError('')
        setDuplicateStatus('')
        setDuplicateScanCompleted(false)
        setSelectedDuplicatePaths(new Set())
        try {
            const result: unknown = await ipcRenderer.invoke('findDuplicateFiles')
            if (!Array.isArray(result)) {
                throw new Error('Unexpected response from the duplicate scanner.')
            }
            const elapsed = Date.now() - scanStartedAt
            const remaining = Math.max(0, 800 - elapsed)
            if (remaining > 0) {
                await new Promise<void>((resolve) => setTimeout(resolve, remaining))
            }
            setDuplicateGroups(result as DuplicateGroup[])
            setDuplicateProgress((previous) => ({
                checked: previous.total,
                total: previous.total,
                percent: 100,
            }))
            setDuplicateScanCompleted(true)
            setDuplicateStatus(
                result.length === 0
                    ? 'Scan completed. No duplicate files found.'
                    : `Scan completed. Found ${result.length} duplicate group(s).`,
            )
        } catch (error) {
            console.error('Duplicate scan failed:', error)
            setDuplicateGroups([])
            setDuplicateError(error instanceof Error ? error.message : 'Unable to scan for duplicate files.')
        } finally {
            setDuplicateLoading(false)
        }
    }

    const toggleDuplicateSelection = (group: DuplicateGroup, filePath: string, checked: boolean): void => {
        setSelectedDuplicatePaths((previous) => {
            const next = new Set(previous)
            if (checked) {
                const selectedInGroup = group.files.filter((file) => next.has(file.path)).length
                if (!next.has(filePath) && selectedInGroup >= group.files.length - 1) {
                    return previous
                }
                next.add(filePath)
            } else {
                next.delete(filePath)
            }
            return next
        })
    }

    const deleteSelectedDuplicates = async (): Promise<void> => {
        if (deletingDuplicates || selectedDuplicatePaths.size === 0) return

        for (const group of duplicateGroups) {
            const selectedCount = group.files.filter((file) => selectedDuplicatePaths.has(file.path)).length
            if (selectedCount >= group.files.length) {
                setDuplicateError('Safety check failed: at least one copy must remain in every group.')
                return
            }
        }

        const selectedCount = selectedDuplicatePaths.size
        const confirmed = window.confirm(
            `Move ${selectedCount} selected file(s) to the Windows Recycle Bin?\n\n` +
                'This action will move files out of their current folders. ' +
                'At least one copy of each duplicate group will be kept.',
        )
        if (!confirmed) return

        setDeletingDuplicates(true)
        setDuplicateError('')
        setDuplicateStatus('')
        let succeeded = 0
        const failures: string[] = []

        try {
            for (const filePath of selectedDuplicatePaths) {
                try {
                    await ipcRenderer.invoke('moveDuplicateToTrash', filePath)
                    succeeded++
                } catch (error) {
                    console.error('Could not move duplicate to Recycle Bin:', filePath, error)
                    failures.push(`${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`)
                }
            }

            setSelectedDuplicatePaths(new Set())
            if (succeeded > 0) {
                setDuplicateStatus(`Moved ${succeeded} file(s) to the Recycle Bin.`)
            }
            if (failures.length > 0) {
                setDuplicateError(`${failures.length} file(s) could not be moved. ` + failures.slice(0, 3).join(' | '))
            }

            await scanDuplicates()

            if (failures.length > 0) {
                setDuplicateError(`${failures.length} file(s) could not be moved. ` + failures.slice(0, 3).join(' | '))
            }
            if (succeeded > 0) {
                setDuplicateStatus(`Moved ${succeeded} file(s) to the Recycle Bin. Results refreshed.`)
            }
        } catch (error) {
            setDuplicateError(
                error instanceof Error ? error.message : 'An error occurred while processing duplicate files.',
            )
        } finally {
            setDeletingDuplicates(false)
        }
    }

    const getReactiveProps = useCallback(() => {
        const activeView = appState.activeView
        const activeCache = activeView.getVisibleCache()
        const API = activeCache.getAPI()
        return {
            status: activeCache.status,
            path: activeCache.path,
            selectedLength: activeCache.selected.length,
            isReadonly: false,
            isIndirect: false,
            historyLength: activeCache.history.length,
            historyCurrent: activeCache.current,
            isRoot: API.isRoot(activeCache.path),
            isOverlayOpen: refIsOverlayOpen.current,
            activeViewTabNums: activeView.caches.length,
            isExplorer: appState.isExplorer,
            language: settingsState.lang,
            filesLength: activeCache.files.length,
            clipboardLength: appState.clipboard.files.length,
            activeViewId: activeView.viewId,
            viewMode: activeCache.viewmode,
            sortMethod: activeCache.sortMethod,
            sortOrder: activeCache.sortOrder,
        }
    }, [appState, settingsState])

    useEffect(() => {
        const mutationObserver = new MutationObserver((mutationList) => {
            for (const mutation of mutationList) {
                if (mutation.attributeName === 'class') {
                    refIsOverlayOpen.current = document.body.classList.contains(Classes.OVERLAY_OPEN)
                    triggerUpdateMenus(
                        t('APP_MENUS', { returnObjects: true }) as Record<string, string>,
                        getReactiveProps(),
                    )
                }
            }
        })
        mutationObserver.observe(document.body, { attributes: true })
        return () => mutationObserver.disconnect()
    }, [getReactiveProps, t])

    useEffect(() => {
        setDarkThemeClass()
    }, [settingsState.isDarkModeActive])

    useEffect(() => {
        if (!window.ENV.CY) {
            ipcRenderer.invoke('window:setProgressBar', progress)
        }
    }, [progress])

    useEffect(() => {
        FocusStyleManager.onlyShowFocusOnTabs()
        document.body.classList.add('loaded', platform)
        if (window.ENV.CY || window.ENV.NODE_ENV === 'development') {
            window.appState = appState
            window.settingsState = settingsState
            window.renderer = ipcRenderer
        }
        console.log(
            `React-Explorer ${window.ENV.VERSION} - CY: ${window.ENV.CY} - NODE_ENV: ${window.ENV.NODE_ENV} - lang: ${i18n.language}`,
        )
        console.log(`hash=${window.ENV.HASH}`)
        console.log(
            `lang=${settingsState.lang}, darkMode=${settingsState.darkMode}, defaultFolder=${settingsState.defaultFolder}`,
        )
        ipcRenderer.on('exitRequest', onExitRequest)
        webFrame.setVisualZoomLevelLimits(1, 4)
        return () => {
            ipcRenderer.removeListener('exitRequest', onExitRequest)
        }
    }, [])

    const onShortcutsCombo = useCallback((e: KeyboardEvent): void => {
        let caught = false
        if (e.ctrlKey) {
            switch (true) {
                case !window.ENV.CY && !isMac && e.key === Keys.A && shouldCatchEvent(e):
                    caught = true
                    sendFakeCombo('CmdOrCtrl+A')
                    break
                case e.key === Keys.TAB:
                    caught = true
                    sendFakeCombo(e.shiftKey ? 'Ctrl+Shift+Tab' : 'Ctrl+Tab')
                    break
            }
        } else if (shouldCatchEvent(e) && e.key === Keys.FORWARD_SLASH && e.shiftKey) {
            caught = true
        }
        if (caught) {
            e.stopPropagation()
            e.stopImmediatePropagation()
            e.preventDefault()
        }
    }, [])

    useEffect(() => {
        return reaction(
            (): ReactiveProperties => getReactiveProps(),
            (value) => {
                triggerUpdateMenus(t('APP_MENUS', { returnObjects: true }) as Record<string, string>, value)
            },
            {
                equals: (value: ReactiveProperties, previousValue: ReactiveProperties) =>
                    JSON.stringify(value) === JSON.stringify(previousValue),
            },
        )
    }, [getReactiveProps, t])

    useEventListener('keydown', onShortcutsCombo, { capture: true })

    useEventListener(
        'copy',
        useCallback(
            (e: Event): void => {
                if (shouldCatchEvent(e)) {
                    cache && appState.clipboard.setClipboard(cache)
                }
            },
            [appState, cache],
        ),
    )

    useEventListener(
        'paste',
        useCallback(
            (e: Event): void => {
                if (shouldCatchEvent(e)) {
                    cache && appState.paste(cache)
                }
            },
            [appState, cache],
        ),
    )

    const setActiveView = (view: number): void => {
        const winState = appState.winStates[0]
        winState.setActiveView(view)
    }

    const handleClick = (e: React.MouseEvent): void => {
        const sideview = (e.target as HTMLElement).closest('.sideview')
        const filetable = (e.target as HTMLElement).closest('.fileListSizerWrapper')
        if (sideview) {
            const num = parseInt(sideview.id.replace('view_', ''), 10)
            const winState = appState.winStates[0]
            const view = winState.getView(num)
            if (!view.isActive) {
                if (filetable && e.button === 2) {
                    console.log('preventing event propagation', e.target)
                    e.stopPropagation()
                }
                setActiveView(num)
            }
        }
    }

    const onExitComboDown = (): void => onExitRequest()

    const onExitRequest = useCallback((): void => {
        console.log('exitRequest')
        if (appState && appState.transferListState.pendingTransfers) {
            setIsExitDialogOpen(true)
        } else {
            console.log('sending readyToExit event')
            ipcRenderer.invoke('readyToExit')
        }
    }, [appState])

    const onExitDialogClose = (valid: boolean): void => {
        setIsExitDialogOpen(false)
        if (!valid) {
            appState.toggleExplorerTab(false)
        } else {
            ipcRenderer.invoke('readyToExit')
        }
    }

    const setDarkThemeClass = (): void => {
        if (settingsState.isDarkModeActive) {
            document.body.classList.add(Classes.DARK)
        } else {
            document.body.classList.remove(Classes.DARK)
        }
    }

    const count = appState.transferListState.pendingTransfers
    const { views, splitView } = appState.winStates[0]
    const mainClass = classNames('main', {
        singleView: !splitView,
        dualView: splitView,
    })

    const extraStorage = duplicateGroups.reduce(
        (total, group) => total + group.size * Math.max(0, group.files.length - 1),
        0,
    )
    const selectedExtraStorage = duplicateGroups.reduce((total, group) => {
        const selectedInGroup = group.files.filter((file) => selectedDuplicatePaths.has(file.path)).length
        return total + group.size * selectedInGroup
    }, 0)

    return (
        <Provider settingsState={settingsState}>
            <React.Fragment>
                <Alert
                    cancelButtonText={t('DIALOG.QUIT.BT_KEEP_TRANSFERS')}
                    confirmButtonText={t('DIALOG.QUIT.BT_STOP_TRANSFERS')}
                    icon="warning-sign"
                    intent={Intent.WARNING}
                    onClose={onExitDialogClose}
                    isOpen={isExitDialogOpen}
                >
                    <p>
                        <Trans
                            i18nKey="DIALOG.QUIT.CONTENT"
                            count={count}
                            tOptions={{
                                interpolation: {
                                    prefix: '[[',
                                    suffix: ']]',
                                },
                            }}
                        >
                            There are <b>[[ count ]]</b> transfers <b>in progress</b>.
                            <br />
                            <br />
                            Exiting the app now will <b>cancel</b> the downloads.
                        </Trans>
                    </p>
                </Alert>

                <PrefsDialog isOpen={isPrefsOpen} onClose={() => appState.togglePrefsDialog(false)} />
                <ShortcutsDialog isOpen={isShortcutsOpen} onClose={() => appState.toggleShortcutsDialog(false)} />
                <MenuAccelerators onExitComboDown={onExitComboDown} />
                <KeyboardHotkeys />

                <Nav
                    activeSection={activeSection === 'analyze' ? 'analyze' : 'dashboard'}
                    setActiveSection={(section: 'dashboard' | 'analyze') => {
                        setShowDuplicates(false)
                        setActiveSection(section)
                    }}
                />

                <div
                    style={{
                        height: 'calc(100vh - 60px)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 16px',
                            borderBottom: '1px solid #d8dee5',
                            flexShrink: 0,
                            flexWrap: 'wrap',
                        }}
                    >
                        <button
                            onClick={() => {
                                setShowDuplicates(false)
                                setActiveSection('dashboard')
                            }}
                            style={navButtonStyle(!showDuplicates && activeSection === 'dashboard')}
                        >
                            Dashboard
                        </button>
                        <button
                            onClick={() => {
                                setShowDuplicates(false)
                                setActiveSection('analyze')
                            }}
                            style={navButtonStyle(!showDuplicates && activeSection === 'analyze')}
                        >
                            Analyze
                        </button>
                        <button
                            onClick={() => {
                                setShowDuplicates(false)
                                setActiveSection('assistant')
                            }}
                            style={navButtonStyle(!showDuplicates && activeSection === 'assistant')}
                        >
                            AI Assistant
                        </button>
                        <button onClick={() => setShowDuplicates(true)} style={navButtonStyle(showDuplicates)}>
                            Duplicate Files
                        </button>
                    </div>

                    {!showDuplicates && (
                        <div
                            style={{
                                flex: '0 0 60%',
                                minHeight: 0,
                                overflow: 'auto',
                            }}
                        >
                            {activeSection === 'dashboard' && <StorageDashboard />}
                            {activeSection === 'analyze' && <StorageTreemap />}
                            {activeSection === 'assistant' && <StorageAssistant />}
                        </div>
                    )}

                    {showDuplicates && (
                        <div
                            style={{
                                flex: '1 1 auto',
                                minHeight: 0,
                                overflow: 'auto',
                                padding: 24,
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 12,
                                    flexWrap: 'wrap',
                                    marginBottom: 20,
                                }}
                            >
                                <div>
                                    <h2 style={{ margin: '0 0 6px' }}>Duplicate Files</h2>
                                    <p style={{ margin: 0, color: '#667085' }}>
                                        Select redundant copies to move them to the Recycle Bin.
                                    </p>
                                </div>
                                <button
                                    onClick={scanDuplicates}
                                    disabled={duplicateLoading || deletingDuplicates}
                                    style={primaryButtonStyle(duplicateLoading || deletingDuplicates)}
                                >
                                    {duplicateLoading ? 'Scanning...' : 'Scan for Duplicates'}
                                </button>
                            </div>

                            {duplicateError && (
                                <div role="alert" style={errorBoxStyle}>
                                    {duplicateError}
                                </div>
                            )}
                            {duplicateStatus && (
                                <div role="status" style={successBoxStyle}>
                                    {duplicateStatus}
                                </div>
                            )}

                            {duplicateScanCompleted && duplicateGroups.length > 0 && (
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
                                        <p style={{ margin: '0 0 6px' }}>
                                            Found <strong>{duplicateGroups.length}</strong> duplicate groups containing{' '}
                                            <strong>
                                                {duplicateGroups.reduce(
                                                    (total, group) => total + group.files.length,
                                                    0,
                                                )}
                                            </strong>{' '}
                                            files.
                                        </p>
                                        <p style={{ margin: 0 }}>
                                            Potential extra storage:{' '}
                                            <strong>{formatDuplicateSize(extraStorage)}</strong>
                                        </p>
                                        {selectedDuplicatePaths.size > 0 && (
                                            <p style={{ margin: '6px 0 0' }}>
                                                Selected: <strong>{selectedDuplicatePaths.size}</strong> file(s),
                                                approximately{' '}
                                                <strong>{formatDuplicateSize(selectedExtraStorage)}</strong>
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={deleteSelectedDuplicates}
                                        disabled={
                                            selectedDuplicatePaths.size === 0 || deletingDuplicates || duplicateLoading
                                        }
                                        style={dangerButtonStyle(
                                            selectedDuplicatePaths.size === 0 || deletingDuplicates || duplicateLoading,
                                        )}
                                    >
                                        {deletingDuplicates
                                            ? 'Moving files...'
                                            : `Delete Selected Duplicates (${selectedDuplicatePaths.size})`}
                                    </button>
                                </div>
                            )}

                            {duplicateLoading && (
                                <div
                                    role="status"
                                    aria-live="polite"
                                    style={{
                                        marginBottom: 16,
                                        padding: 16,
                                        border: '1px solid #d8dee5',
                                        borderRadius: 8,
                                        background: settingsState.isDarkModeActive ? '#252a31' : '#f8fafc',
                                        color: settingsState.isDarkModeActive ? '#f3f4f6' : '#20252b',
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            gap: 12,
                                            marginBottom: 8,
                                            flexWrap: 'wrap',
                                        }}
                                    >
                                        <strong>Scanning for duplicate files...</strong>
                                        <span>
                                            {duplicateProgress.percent}% · {duplicateProgress.checked} /{' '}
                                            {duplicateProgress.total} files checked
                                        </span>
                                    </div>
                                    <div
                                        role="progressbar"
                                        aria-label="Duplicate scan progress"
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={duplicateProgress.percent}
                                        style={{
                                            width: '100%',
                                            height: 10,
                                            overflow: 'hidden',
                                            borderRadius: 999,
                                            background: settingsState.isDarkModeActive ? '#414853' : '#e5e7eb',
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: `${duplicateProgress.percent}%`,
                                                height: '100%',
                                                borderRadius: 999,
                                                background: '#2869b2',
                                                transition: 'width 150ms ease',
                                            }}
                                        />
                                    </div>
                                    {duplicateProgress.total === 0 && (
                                        <p style={{ margin: '8px 0 0', fontSize: 12 }}>
                                            Preparing files for scanning...
                                        </p>
                                    )}
                                </div>
                            )}

                            {!duplicateLoading && !duplicateScanCompleted && !duplicateError && (
                                <div style={emptyBoxStyle}>
                                    Select <strong>Scan for Duplicates</strong> to search your indexed files.
                                </div>
                            )}
                            {!duplicateLoading &&
                                duplicateScanCompleted &&
                                !duplicateError &&
                                duplicateGroups.length === 0 && (
                                    <div style={emptyBoxStyle}>No duplicate files were found in the indexed files.</div>
                                )}

                            {!duplicateLoading &&
                                duplicateGroups.map((group, groupIndex) => {
                                    const selectedInGroup = group.files.filter((file) =>
                                        selectedDuplicatePaths.has(file.path),
                                    ).length
                                    return (
                                        <div
                                            key={`${group.hash}-${groupIndex}`}
                                            style={{
                                                padding: 16,
                                                marginBottom: 14,
                                                border: '1px solid #d8dee5',
                                                borderRadius: 8,
                                                background: settingsState.isDarkModeActive ? '#252a31' : '#fff',
                                                color: settingsState.isDarkModeActive ? '#f3f4f6' : '#20252b',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    gap: 12,
                                                    flexWrap: 'wrap',
                                                    marginBottom: 12,
                                                }}
                                            >
                                                <strong>Duplicate group {groupIndex + 1}</strong>
                                                <span>
                                                    {formatDuplicateSize(group.size)} per file · {group.files.length}{' '}
                                                    copies
                                                </span>
                                            </div>
                                            {group.files.map((file, fileIndex) => {
                                                const isSelected = selectedDuplicatePaths.has(file.path)
                                                const wouldRemoveAll =
                                                    !isSelected && selectedInGroup >= group.files.length - 1
                                                return (
                                                    <div
                                                        key={`${file.path}-${fileIndex}`}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'flex-start',
                                                            gap: 10,
                                                            padding: '12px 0',
                                                            borderTop: '1px solid #edf0f3',
                                                            overflowWrap: 'anywhere',
                                                        }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            disabled={
                                                                deletingDuplicates || duplicateLoading || wouldRemoveAll
                                                            }
                                                            onChange={(event) =>
                                                                toggleDuplicateSelection(
                                                                    group,
                                                                    file.path,
                                                                    event.target.checked,
                                                                )
                                                            }
                                                            aria-label={`Select duplicate ${file.name}`}
                                                            title={
                                                                wouldRemoveAll
                                                                    ? 'Keep at least one copy in this group'
                                                                    : 'Select this file for the Recycle Bin'
                                                            }
                                                            style={{ marginTop: 4, flexShrink: 0 }}
                                                        />
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>
                                                                {file.name}
                                                            </div>
                                                            <div
                                                                style={{
                                                                    marginTop: 4,
                                                                    fontSize: 12,
                                                                    color: settingsState.isDarkModeActive
                                                                        ? '#b9c1cc'
                                                                        : '#667085',
                                                                    overflowWrap: 'anywhere',
                                                                }}
                                                            >
                                                                {file.path}
                                                            </div>
                                                            {isSelected && (
                                                                <div
                                                                    style={{
                                                                        marginTop: 5,
                                                                        fontSize: 12,
                                                                        color: '#b45309',
                                                                    }}
                                                                >
                                                                    Selected to move to Recycle Bin
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                            <div style={{ fontSize: 12, color: '#667085', marginTop: 8 }}>
                                                {group.files.length - selectedInGroup} copy/copies will remain after the
                                                current selection.
                                            </div>
                                        </div>
                                    )
                                })}

                            {deletingDuplicates && (
                                <p role="status">
                                    Moving selected files to the Recycle Bin. Please keep StorageOS open until this
                                    finishes.
                                </p>
                            )}
                        </div>
                    )}

                    <div
                        style={{
                            flex: '0 0 40%',
                            minHeight: 0,
                            overflow: 'hidden',
                            display: showDuplicates ? 'none' : 'block',
                        }}
                    >
                        <div
                            className={mainClass}
                            style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}
                            onClickCapture={handleClick}
                            onContextMenuCapture={handleClick}
                        >
                            <LeftPanel hide={!isExplorer} />
                            <SideView viewState={views[0]} hide={!isExplorer} />
                            {splitView && <SideView viewState={views[1]} hide={!isExplorer} />}
                            <Downloads hide={isExplorer} />
                        </div>
                    </div>
                </div>
                {cache?.cursor && <PreviewDialog />}
            </React.Fragment>
        </Provider>
    )
})

const navButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 12px',
    cursor: 'pointer',
    border: '1px solid #cbd2da',
    borderRadius: 5,
    background: active ? '#dce9f8' : 'white',
    color: '#20252b',
    fontWeight: active ? 600 : 400,
})

const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    border: 0,
    borderRadius: 5,
    background: disabled ? '#9bb8da' : '#2869b2',
    color: 'white',
    cursor: disabled ? 'wait' : 'pointer',
})

const dangerButtonStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    border: 0,
    borderRadius: 5,
    background: disabled ? '#c9a2a2' : '#b42318',
    color: 'white',
    cursor: disabled ? 'not-allowed' : 'pointer',
})

const emptyBoxStyle: React.CSSProperties = {
    padding: 24,
    textAlign: 'center',
    border: '1px dashed #cbd2da',
    borderRadius: 8,
    color: '#667085',
}

const errorBoxStyle: React.CSSProperties = {
    padding: 12,
    marginBottom: 16,
    borderRadius: 5,
    background: '#fff0f0',
    color: '#a12626',
    overflowWrap: 'anywhere',
}

const successBoxStyle: React.CSSProperties = {
    padding: 12,
    marginBottom: 16,
    borderRadius: 5,
    background: '#ecfdf3',
    color: '#067647',
}

export { App }
