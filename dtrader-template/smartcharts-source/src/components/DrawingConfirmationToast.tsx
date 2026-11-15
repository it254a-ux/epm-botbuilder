/* eslint-disable react/react-in-jsx-scope */
import { useEffect, useRef, useCallback } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { localize } from 'src/translations';
import { useStores } from '../store';
import { isHorizontalOrVerticalTool } from '../constants/drawingTools';

type TDrawingConfirmationToastProps = {
    className?: string;
};

const DrawingConfirmationToast = observer(({ className }: TDrawingConfirmationToastProps) => {
    const { drawTools } = useStores();
    const toastRef = useRef<HTMLDivElement>(null);

    const {
        showConfirmationToast: isVisible,
        confirmationMessage: message,
        cancelAddingNewTool: onCancel,
        hideDrawingConfirmation: onDismiss,
        addingStateInfo,
        selectedToolId,
    } = drawTools;

    // Generate dynamic message based on adding state and tool type
    const getDynamicMessage = useCallback(() => {
        // For horizontal and vertical tools (single step tools)
        if (isHorizontalOrVerticalTool(selectedToolId)) {
            return localize('Click on the chart to place the line.');
        }

        // For multi-step tools
        if (addingStateInfo.currentStep === 0 && addingStateInfo.totalSteps > 1) {
            return localize('Click on the chart to confirm the start point.');
        }

        if (addingStateInfo.currentStep === 1 && addingStateInfo.totalSteps > 1) {
            return localize('Click on the chart to confirm the end point.');
        }

        // For any other steps in multi-step tools (if needed for future tools)
        if (addingStateInfo.currentStep > 1 && !addingStateInfo.isFinished) {
            return localize('Click on the chart to confirm point {{step}}.', {
                step: (addingStateInfo.currentStep + 1).toString(),
            });
        }

        // Fallback to the original message
        return message;
    }, [selectedToolId, addingStateInfo, message]);

    // Handle click outside to dismiss
    const handleClickOutside = useCallback(
        (event: MouseEvent) => {
            if (toastRef.current && !toastRef.current.contains(event.target as Node)) {
                onDismiss?.();
            }
        },
        [onDismiss]
    );

    // Handle escape key to dismiss
    const handleEscapeKey = useCallback(
        (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onDismiss?.();
            }
        },
        [onDismiss]
    );

    useEffect(() => {
        if (isVisible) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscapeKey);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
                document.removeEventListener('keydown', handleEscapeKey);
            };
        }
    }, [isVisible, handleClickOutside, handleEscapeKey]);

    if (!isVisible || drawTools.addingStateInfo.isFinished) return null;

    return (
        <div ref={toastRef} className={classNames('sc-drawing-toast', className)} role='alert' aria-live='polite'>
            <div className='sc-drawing-toast__content'>
                <span className='sc-drawing-toast__message'>{getDynamicMessage()}</span>
                <button
                    className='sc-drawing-toast__cancel'
                    onClick={onCancel}
                    aria-label={localize('Cancel')}
                    type='button'
                >
                    {localize('Cancel')}
                </button>
            </div>
        </div>
    );
});

export default DrawingConfirmationToast;
