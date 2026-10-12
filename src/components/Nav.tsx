import * as React from 'react'
import { Navbar, Alignment, Button, Classes, Intent } from '@blueprintjs/core'
import { IconNames } from '@blueprintjs/icons'
import { Popover2 } from '@blueprintjs/popover2'
import { observer } from 'mobx-react'
import { useTranslation } from 'react-i18next'
import classNames from 'classnames'

import { HamburgerMenu } from '$src/components/HamburgerMenu'
import { Badge } from '$src/components/Badge'
import { useStores } from '$src/hooks/useStores'

interface NavProps {
    activeSection?: 'dashboard' | 'analyze'
    setActiveSection?: React.Dispatch<React.SetStateAction<'dashboard' | 'analyze'>>
}

const Nav = observer(({ activeSection = 'dashboard', setActiveSection }: NavProps) => {
    const { appState } = useStores('appState')
    const { transferListState } = appState
    const { t } = useTranslation()

    const isExplorer = appState.isExplorer
    const count = appState.transferListState.pendingTransfers
    const badgeText = (count && count + '') || ''
    const badgeProgress = transferListState.totalTransferProgress

    const downloadClass = classNames(Classes.MINIMAL, 'download')

    const isSplitViewActive = appState.winStates[0].splitView

    const onExplorerClick = (): void => {
        setActiveSection('dashboard')

        if (!appState.isExplorer) {
            appState.toggleExplorerTab(true)
        }
    }

    const onTransfersClick = (): void => {
        setActiveSection('dashboard')

        if (appState.isExplorer) {
            appState.toggleExplorerTab(false)
        }
    }

    const onToggleSplitView = (): void => appState.isExplorer && appState.toggleSplitViewMode()

    return (
        <Navbar>
            <Navbar.Group align={Alignment.LEFT} className="title-group">
                <Navbar.Heading>StorageOS</Navbar.Heading>

                <Navbar.Divider />

                {/* ================= DASHBOARD ================= */}
                <Button
                    className={Classes.MINIMAL}
                    icon="dashboard"
                    text="Dashboard"
                    onClick={() => {
                        setActiveSection('dashboard')
                        if (!appState.isExplorer) {
                            appState.toggleExplorerTab(true)
                        }
                    }}
                    intent={activeSection === 'dashboard' ? Intent.PRIMARY : 'none'}
                />

                {/* ================= ANALYZE ================= */}
                <Button
                    className={Classes.MINIMAL}
                    icon="chart"
                    text="Analyze"
                    onClick={() => {
                        setActiveSection('analyze')
                        if (!appState.isExplorer) {
                            appState.toggleExplorerTab(true)
                        }
                    }}
                    intent={activeSection === 'analyze' ? Intent.PRIMARY : 'none'}
                />

                <Navbar.Divider />

                {/* ================= EXPLORER ================= */}
                <Button
                    className={`${Classes.MINIMAL} data-cy-explorer-tab`}
                    icon="home"
                    text={t('NAV.EXPLORER')}
                    onClick={onExplorerClick}
                    intent={isExplorer ? Intent.PRIMARY : 'none'}
                />

                {/* ================= TRANSFERS ================= */}
                <Button
                    style={{ position: 'relative' }}
                    className={`${downloadClass} data-cy-downloads-tab`}
                    icon="download"
                    onClick={onTransfersClick}
                    intent={!isExplorer ? Intent.PRIMARY : 'none'}
                >
                    {t('NAV.TRANSFERS')}

                    <Badge intent="none" text={badgeText} progress={badgeProgress} />
                </Button>
            </Navbar.Group>

            <Navbar.Group align={Alignment.RIGHT}>
                {/* ================= SPLIT VIEW ================= */}
                <Button
                    className={`data-cy-toggle-splitview ${Classes.MINIMAL}`}
                    active={isSplitViewActive}
                    intent={(isSplitViewActive && 'primary') || 'none'}
                    onClick={onToggleSplitView}
                    icon={IconNames.PANEL_STATS}
                    title={t('NAV.SPLITVIEW')}
                />

                <Navbar.Divider />

                {/* ================= SETTINGS ================= */}
                <Popover2
                    content={
                        <HamburgerMenu
                            onOpenShortcuts={() => appState.toggleShortcutsDialog(true)}
                            onOpenPrefs={() => appState.togglePrefsDialog(true)}
                        />
                    }
                >
                    <Button className={`data-cy-toggle-app-menu ${Classes.MINIMAL}`} icon={IconNames.SETTINGS} />
                </Popover2>
            </Navbar.Group>
        </Navbar>
    )
})

export { Nav }
