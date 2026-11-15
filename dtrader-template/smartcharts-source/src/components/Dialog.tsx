import React, { useEffect, forwardRef } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import DialogStore from 'src/store/DialogStore';
import { CloseIcon } from './Icons';
import '../../sass/components/_dialog.scss';

export type TDialogProps = {
    store: DialogStore;
    className?: string;
    enableTabular?: boolean;
    title?: string;
    handleCloseDialog?: () => void;
    handleOverlayClick?: () => void;
    customHead?: React.ReactElement;
    children?: React.ReactNode;
};

const Dialog = forwardRef<HTMLDivElement, TDialogProps>((
    {
        store,
        children,
        className = '',
        title,
        customHead,
        enableTabular = false,
        handleOverlayClick,
        handleCloseDialog,
    }, 
    ref
) => {
    const { updateCloseCallback, onContainerClick, updateOutsideClickCallback } = store;

    useEffect(() => {
        updateCloseCallback(handleCloseDialog);
        updateOutsideClickCallback(handleOverlayClick);
    });

    return (
        <div
            ref={ref}
            className={classNames('sc-dialog', className, { 'sc-dialog--tabular': enableTabular })}
            onClick={onContainerClick}
        >
            {title && (
                <div className='sc-dialog__head'>
                    <div className='sc-dialog__head--title'>{title}</div>
                    {customHead && <div className='sc-dialog__head--custom'>{customHead}</div>}
                    <div className='sc-dialog__head--action'>
                        <CloseIcon onClick={handleCloseDialog} />
                    </div>
                </div>
            )}
            <div className='sc-dialog__body'>{children}</div>
        </div>
    );
});

// Add display name for forwardRef component to fix React DevTools warning
Dialog.displayName = 'Dialog';

export default observer(Dialog);
