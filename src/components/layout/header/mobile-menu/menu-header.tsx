// Updated to show a plain "Settings" title (matching other templates' drawer style)
import { ComponentProps } from 'react';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import { LabelPairedGlobeSmRegularIcon } from '@deriv/quill-icons';
import { LegacyTheme2pxIcon } from '@deriv/quill-icons/Legacy';
import { useTranslations } from '@deriv-com/translations';
import { Text, useDevice } from '@deriv-com/ui';

type TMenuHeader = {
    hideLanguageSetting: boolean;
    // Using ComponentProps<'button'>['onClick'] for better type safety and consistency
    // with button onClick event handlers
    openLanguageSetting: ComponentProps<'button'>['onClick'];
    // [AI] Show the theme toggle in this header row, next to the "Settings" title,
    // instead of as its own row further down in the menu body.
    showThemeToggle?: boolean;
    // [/AI]
};

const MenuHeader = ({ hideLanguageSetting, openLanguageSetting, showThemeToggle = false }: TMenuHeader) => {
    const { currentLang, localize } = useTranslations();
    const { isDesktop } = useDevice();
    // [AI] Theme toggle lives here now (see showThemeToggle above)
    const { is_dark_mode_on, toggleTheme } = useThemeSwitcher();
    // [/AI]

    return (
        <div className='mobile-menu__header'>
            {/* [AI] Show a plain "Settings" title instead of the logo + app name mark */}
            <Text size={isDesktop ? 'sm' : 'md'} weight='bold'>
                {localize('Settings')}
            </Text>
            {/* [/AI] */}

            {/* [AI] Theme toggle: kept out from right up against the "Settings" title —
                the row's own space-between + this button's margin give it breathing
                room instead of crowding the title. Sized/weighted (2px icon, sm size)
                to read as clearly as the bold "Settings" title beside it. */}
            {showThemeToggle && (
                <button
                    className='mobile-menu__header__theme-toggle'
                    onClick={toggleTheme}
                    aria-label={localize('Toggle theme')}
                    aria-pressed={is_dark_mode_on}
                >
                    <LegacyTheme2pxIcon iconSize='sm' fill='var(--text-prominent)' />
                </button>
            )}
            {/* [/AI] */}

            {!hideLanguageSetting && (
                <button
                    className='mobile-menu__header__language items-center'
                    onClick={openLanguageSetting}
                    aria-label={`${localize('Change language')} - ${localize('Current language')}: ${currentLang}`}
                    aria-expanded='false'
                    aria-haspopup='menu'
                >
                    <LabelPairedGlobeSmRegularIcon />
                    <Text className='ml-[0.4rem]' size={isDesktop ? 'xs' : 'sm'} weight='bold'>
                        {currentLang}
                    </Text>
                </button>
            )}
        </div>
    );
};

export default MenuHeader;
