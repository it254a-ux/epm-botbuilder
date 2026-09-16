// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import { memo } from 'react';
import { ChartMode, DrawTools, Share, StudyLegend, ToolbarWidget, Views } from '@deriv-com/smartcharts-champion';
import { useDevice } from '@deriv-com/ui';

type TToolbarWidgetsProps = {
    updateChartType: (chart_type: string) => void;
    updateGranularity: (updateGranularity: number) => void;
    position?: string | null;
    isDesktop?: boolean;
};

const ToolbarWidgets = ({ updateChartType, updateGranularity, position, isDesktop }: TToolbarWidgetsProps) => {
    const { isMobile } = useDevice();
    const validPosition = position === 'top' || position === 'bottom' ? position : 'top';

    // Points at 'smartcharts_portal_root' (index.html), not 'modal_root'.
    // modal_root carries .modal-root's styling — a dark 72% backdrop,
    // flex-centered — built for the app's own dialog modals (Load
    // Strategy, etc). These are small anchored dropdowns (chart type,
    // study legend, draw tools, share), not centered dialogs; portaling
    // them into modal_root wrapped them in that dialog styling instead of
    // letting them render as a normal anchored dropdown next to their
    // toolbar icon — clicking them appeared to do nothing useful.
    return (
        <ToolbarWidget position={validPosition || (isMobile ? 'bottom' : null)}>
            <ChartMode portalNodeId='smartcharts_portal_root' onChartType={updateChartType} onGranularity={updateGranularity} />
            {isDesktop && (
                <>
                    <StudyLegend portalNodeId='smartcharts_portal_root' searchInputClassName='data-hj-whitelist' />
                    <Views
                        portalNodeId='smartcharts_portal_root'
                        onChartType={updateChartType}
                        onGranularity={updateGranularity}
                        searchInputClassName='data-hj-whitelist'
                    />
                </>
            )}
            <DrawTools portalNodeId='smartcharts_portal_root' />
            {isDesktop && (
                <>
                    <Share portalNodeId='smartcharts_portal_root' />
                </>
            )}
        </ToolbarWidget>
    );
};

export default memo(ToolbarWidgets);
