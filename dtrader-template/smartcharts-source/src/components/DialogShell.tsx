import { ActionSheet, Modal } from '@deriv-com/quill-ui';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStores } from 'src/store';
import '../../sass/components/_quill-dialogs.scss';

/**
 * The portal container belongs to one chart, not to the page.
 *
 * A single shared node would be written by every mounted `SmartChart`, and the last effect
 * to run would decide the theme and device classes for all of them - so on a page with two
 * charts in different themes, one chart's dialogs would silently render in the other's
 * theme. Keying on `chartId` keeps them apart.
 *
 * Styling hooks off the `.smartcharts-quill-portal` class rather than this id, so the id
 * varying per instance costs nothing.
 */
export const quillPortalId = (chartId?: string) =>
    // `ChartStore` types `chartId` as optional but always assigns it (`props.id || 'base-chart'`);
    // the fallback just keeps the id well-formed if this is ever called before that runs.
    `smartcharts-quill-portal-${chartId ?? 'base-chart'}`;

/**
 * Quill portals to `document.getElementById(portalId)`, so the dialog lands outside the
 * `.smartcharts-{theme}` wrapper and outside any stacking context the chart creates.
 *
 * We therefore own a body-level container and stamp the chart's theme onto it. Quill's
 * design tokens are CSS custom properties declared on `html.light` / `html.dark`; because
 * custom properties inherit, re-declaring the handful this dialog consumes on the container
 * overrides them for the whole subtree. That keeps the dialog matching `settings.theme` even
 * if the host app's `<html>` class disagrees (see _quill-dialogs.scss).
 */
const useQuillPortal = (portalId: string, theme: string, isMobile?: boolean) => {
    const [node, setNode] = React.useState<HTMLElement | null>(null);

    React.useEffect(() => {
        let el = document.getElementById(portalId);
        if (!el) {
            el = document.createElement('div');
            el.id = portalId;
            document.body.appendChild(el);
        }
        setNode(el);
    }, [portalId]);

    React.useEffect(() => {
        if (!node) return;
        // The device class matters as much as the theme: SmartCharts' stylesheets key
        // responsive rules off `.smartcharts-mobile`, and the portal sits outside the
        // chart's own wrapper, so it has to carry both itself.
        node.className = classNames('smartcharts-quill-portal', `smartcharts-${theme}`, {
            'smartcharts-mobile': isMobile,
            'smartcharts-desktop': !isMobile,
        });
    }, [node, theme, isMobile]);

    return node;
};

type TDialogShellProps = {
    open: boolean;
    onClose: () => void;
    /** Rendered as the sheet header on mobile. Desktop titles are drawn by each dialog's body. */
    mobileTitle?: string;
    /**
     * Quill's corner close button. Turn it off when the design places the dismiss control
     * inside the dialog's own header instead.
     */
    showCloseButton?: boolean;
    className?: string;
    children?: React.ReactNode;
};

/**
 * `DialogStore` closes the active dialog from a document-level click listener unless the
 * event is stamped `isHandledByDialog` - the flag the legacy `Dialog` component set on its
 * container. Quill's desktop Modal happens to survive because it calls `stopPropagation()`
 * on its container, but the ActionSheet does not, so on mobile *any* tap inside the sheet
 * (even inert text) dismissed it.
 *
 * Stamping here restores the contract for both surfaces and stops desktop depending on a
 * quill implementation detail. `display: contents` keeps the wrapper out of the layout while
 * still carrying the event - propagation follows the DOM tree, not the box tree.
 */
export const markHandled = (e: React.MouseEvent) => {
    (e.nativeEvent as unknown as { isHandledByDialog?: boolean }).isHandledByDialog = true;
};

const DialogSurface = ({ children }: { children?: React.ReactNode }) => (
    <div style={{ display: 'contents' }} onClickCapture={markHandled}>
        {children}
    </div>
);

const DialogShell = ({
    open,
    onClose,
    mobileTitle,
    showCloseButton = true,
    className,
    children,
}: TDialogShellProps) => {
    const { chart, chartSetting } = useStores();
    const { isMobile, chartId } = chart;
    const portalId = quillPortalId(chartId);
    const portalNode = useQuillPortal(portalId, chartSetting.theme, isMobile);

    // Nothing to portal into yet (first paint) — render nothing rather than let quill
    // fall back to `#modal-root` / `document.body`, which would skip our theme scope.
    if (!portalNode) return null;

    if (isMobile) {
        return (
            <ActionSheet.Root isOpen={open} onClose={onClose} expandable={false} position='left'>
                <ActionSheet.Portal showHandlebar shouldCloseOnDrag portalId={portalId}>
                    <DialogSurface>
                        {mobileTitle && <ActionSheet.Header title={mobileTitle} />}
                        {/* `sc-quill-sheet` marks the sheet's scroll region - quill's own
                            `action-sheet--content`, which it does not document. Dialogs that
                            need to reach it (to hold its height, to cap it) hook onto this
                            instead, and because only the sheet carries it, the same selector
                            is inert on desktop where the Modal branch renders. */}
                        <ActionSheet.Content className={classNames('sc-quill-dialog', 'sc-quill-sheet', className)}>
                            {children}
                        </ActionSheet.Content>
                    </DialogSurface>
                </ActionSheet.Portal>
            </ActionSheet.Root>
        );
    }

    return (
        <Modal
            isOpened={open}
            toggleModal={onClose}
            showCrossIcon={showCloseButton}
            hasFooter={false}
            portalId={portalId}
            className={classNames('sc-quill-dialog', className)}
        >
            <DialogSurface>{children}</DialogSurface>
        </Modal>
    );
};

export default observer(DialogShell);
