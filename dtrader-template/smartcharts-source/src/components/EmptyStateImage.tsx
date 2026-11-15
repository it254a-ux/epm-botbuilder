/* eslint-disable react/react-in-jsx-scope -- tsconfig uses jsx:"react-jsx";
   React is injected by webpack's ProvidePlugin, so importing it here would be unused. */
import classNames from 'classnames';
import magnifier from '../assets/empty-state-magnifier.webp';

/** Design renders the illustration in a 64px box; the asset is 4x that for high-DPI screens. */
const SIZE = 64;

type TEmptyStateImageProps = {
    className?: string;
};

/**
 * The magnifier illustration shown when a dialog has nothing to list.
 *
 * A WebP rather than an SVG: it is a shaded 3D render, which vectorises poorly and would dwarf
 * the sprite. Mirrors how derivatives-trader ships its own empty-state art
 * (`no-market-found.webp`), at the same 4x-of-display resolution.
 *
 * Marked decorative - every empty state pairs it with a heading that already states the
 * message, so giving it alt text would only make screen readers announce that message twice.
 */
const EmptyStateImage = ({ className }: TEmptyStateImageProps) => {
    // `magnifier` is `__webpack_public_path__ + filename` evaluated when this module is first
    // evaluated - which happens while the host is still `import`ing the library, i.e. before it
    // gets the chance to call `setSmartChartsPublicPath`. The baked prefix is therefore always
    // the empty default, so the filename is re-joined to whatever the public path is now.
    // Sprite icons avoid this only because each one lives in its own lazily-evaluated module.
    const src = `${__webpack_public_path__}${magnifier.split('/').pop() ?? magnifier}`;

    return (
        <img
            src={src}
            alt=''
            aria-hidden
            width={SIZE}
            height={SIZE}
            className={classNames('sc-empty-state-image', className)}
        />
    );
};

export default EmptyStateImage;
