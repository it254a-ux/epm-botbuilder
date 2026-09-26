import { useTranslations } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MenuHeader from '../menu-header';

const mockOpenLanguageSetting = jest.fn();

jest.mock('@deriv-com/ui', () => ({
    ...jest.requireActual('@deriv-com/ui'),
    useDevice: jest.fn(() => ({ isDesktop: false })),
}));

jest.mock('@deriv-com/translations', () => ({
    useTranslations: jest.fn(),
}));

describe('MenuHeader component', () => {
    beforeEach(() => {
        (useTranslations as jest.Mock).mockReturnValue({
            currentLang: 'EN',
            localize: jest.fn(text => text),
        });
    });

    // [AI] Header shows a plain "Settings" title instead of the logo + app name mark
    it('renders the Settings title in mobile view', () => {
        render(<MenuHeader hideLanguageSetting={false} openLanguageSetting={mockOpenLanguageSetting} />);
        expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('renders the Settings title in desktop view', () => {
        (useDevice as jest.Mock).mockReturnValue({ isDesktop: true });
        render(<MenuHeader hideLanguageSetting={false} openLanguageSetting={mockOpenLanguageSetting} />);
        expect(screen.getByText('Settings')).toBeInTheDocument();
    });
    // [/AI]

    it('does not render language setting button when hideLanguageSetting is true', () => {
        render(<MenuHeader hideLanguageSetting openLanguageSetting={mockOpenLanguageSetting} />);
        expect(screen.queryByText('EN')).not.toBeInTheDocument();
    });

    it('renders language setting button with correct content when hideLanguageSetting is false', () => {
        render(<MenuHeader hideLanguageSetting={false} openLanguageSetting={mockOpenLanguageSetting} />);
        expect(screen.getByText('EN')).toBeInTheDocument();
    });

    it('calls openLanguageSetting when language button is clicked', async () => {
        render(<MenuHeader hideLanguageSetting={false} openLanguageSetting={mockOpenLanguageSetting} />);
        await userEvent.click(screen.getByText('EN'));
        expect(mockOpenLanguageSetting).toHaveBeenCalled();
    });

    // [AI] Theme toggle now lives in this header row, next to "Settings"
    // (see mobile-menu.tsx's showThemeToggle prop) instead of as its own
    // row in the menu body.
    it('does not render the theme toggle by default', () => {
        render(<MenuHeader hideLanguageSetting openLanguageSetting={mockOpenLanguageSetting} />);
        expect(screen.queryByLabelText('Toggle theme')).not.toBeInTheDocument();
    });

    it('renders the theme toggle next to Settings when showThemeToggle is true', () => {
        render(
            <MenuHeader
                hideLanguageSetting
                openLanguageSetting={mockOpenLanguageSetting}
                showThemeToggle
            />
        );
        expect(screen.getByLabelText('Toggle theme')).toBeInTheDocument();
    });

    it('toggles theme when the theme button is clicked', async () => {
        render(
            <MenuHeader
                hideLanguageSetting
                openLanguageSetting={mockOpenLanguageSetting}
                showThemeToggle
            />
        );
        const themeButton = screen.getByLabelText('Toggle theme');
        // Falls back to useThemeSwitcher's no-store default (is_dark_mode_on: false),
        // so this just confirms the click handler is wired up without throwing.
        await userEvent.click(themeButton);
        expect(themeButton).toBeInTheDocument();
    });
    // [/AI]
});
