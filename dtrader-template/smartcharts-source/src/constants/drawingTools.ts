/**
 * Drawing tool constants
 * Centralized constants for drawing tool identification and categorization
 */

// Drawing tool IDs
export const DRAWING_TOOL_IDS = {
    HORIZONTAL: 'horizontal',
    VERTICAL: 'vertical',
    LINE: 'line',
    RECTANGLE: 'rectangle',
    TREND: 'trend',
    RAY: 'ray',
    CHANNEL: 'channel',
    CONTINUOUS: 'continuous',
    FIBFAN: 'fibfan',
} as const;

// Single-step tools (tools that complete in one click)
export const SINGLE_STEP_TOOLS = [DRAWING_TOOL_IDS.HORIZONTAL, DRAWING_TOOL_IDS.VERTICAL] as const;

// Multi-step tools (tools that require multiple clicks)
export const MULTI_STEP_TOOLS = [
    DRAWING_TOOL_IDS.LINE,
    DRAWING_TOOL_IDS.RECTANGLE,
    DRAWING_TOOL_IDS.TREND,
    DRAWING_TOOL_IDS.RAY,
    DRAWING_TOOL_IDS.CHANNEL,
    DRAWING_TOOL_IDS.CONTINUOUS,
    DRAWING_TOOL_IDS.FIBFAN,
] as const;

// Line-based tools (tools that draw lines)
export const LINE_BASED_TOOLS = [
    DRAWING_TOOL_IDS.LINE,
    DRAWING_TOOL_IDS.TREND,
    DRAWING_TOOL_IDS.RAY,
    DRAWING_TOOL_IDS.HORIZONTAL,
    DRAWING_TOOL_IDS.VERTICAL,
] as const;

// Helper functions
export const isHorizontalOrVerticalTool = (toolId: string | null): boolean => {
    return toolId === DRAWING_TOOL_IDS.HORIZONTAL || toolId === DRAWING_TOOL_IDS.VERTICAL;
};

export const isSingleStepTool = (toolId: string | null): boolean => {
    return SINGLE_STEP_TOOLS.includes(toolId as any);
};

export const isMultiStepTool = (toolId: string | null): boolean => {
    return MULTI_STEP_TOOLS.includes(toolId as any);
};

export const isLineBasedTool = (toolId: string | null): boolean => {
    return LINE_BASED_TOOLS.includes(toolId as any);
};

// Type definitions
export type DrawingToolId = (typeof DRAWING_TOOL_IDS)[keyof typeof DRAWING_TOOL_IDS];
export type SingleStepTool = (typeof SINGLE_STEP_TOOLS)[number];
export type MultiStepTool = (typeof MULTI_STEP_TOOLS)[number];
export type LineBasedTool = (typeof LINE_BASED_TOOLS)[number];
