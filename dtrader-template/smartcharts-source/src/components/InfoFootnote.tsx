import classNames from 'classnames';
import React from 'react';

type InfoFootnoteProps = {
    className?: string;
    isMobile?: boolean;
    text: string;
};

const InfoFootnote = ({ className = 'info-footnote', isMobile = false, text }: InfoFootnoteProps) => (
    <div
        className={classNames(className, {
            [`${className}--mobile`]: isMobile,
        })}
    >
        {text}
    </div>
);

export default React.memo(InfoFootnote);
