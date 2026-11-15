import classNames from 'classnames';

type THamburgerDragIconProps = {
    isOverlapping?: boolean;
};

const HamburgerDragIcon = ({ isOverlapping }: THamburgerDragIconProps) => (
    <div className={classNames('drag-icon', { 'drag-icon--hidden': isOverlapping })}>
        <div className={classNames({ 'drag-icon--hidden': isOverlapping })} />
        <div className={classNames({ 'drag-icon--hidden': isOverlapping })} />
        <div className={classNames({ 'drag-icon--hidden': isOverlapping })} />
    </div>
);

export default HamburgerDragIcon;
