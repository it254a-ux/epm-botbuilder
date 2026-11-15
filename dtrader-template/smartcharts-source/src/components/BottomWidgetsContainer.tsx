import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from 'src/store';
import '../../sass/components/_bottom-widget-container.scss';

const BottomWidgetsContainer = ({ children }: { children?: React.ReactNode }) => {
    const { bottomWidgetsContainer } = useStores();
    const { bottom = 0, isReadyToShow = false } = bottomWidgetsContainer;

    if (!isReadyToShow) {
        return null;
    }

    const styles = {
        bottom,
    };

    return (
        <div className='cq-bottom-ui-widgets' style={styles}>
            {children}
        </div>
    );
};

export default observer(BottomWidgetsContainer);
