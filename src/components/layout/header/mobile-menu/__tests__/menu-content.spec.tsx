import { BrowserRouter } from 'react-router-dom';
import { mockStore, StoreProvider } from '@/hooks/useStore';
import { mock_ws } from '@/utils/mock';
import { useDevice } from '@deriv-com/ui';
import { render, screen } from '@testing-library/react';
import MenuContent from '../menu-content';

jest.mock('@deriv-com/ui', () => ({
    ...jest.requireActual('@deriv-com/ui'),
    useDevice: jest.fn(() => ({ isDesktop: false })),
}));

// Updated tests to reflect white-labeling changes:
// - Removed Reports menu item
// - Theme toggle moved out of this list into MenuHeader (next to "Settings"),
//   so MenuContent itself now only shows Log out (see menu-header.spec.tsx
//   for the theme-toggle coverage).
describe('MenuContent Component', () => {
    const mock_store = mockStore(mock_ws as any);

    // Mock client as logged in to show logout button
    mock_store.client.is_logged_in = true;

    const mockOnLogout = jest.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <BrowserRouter>
            <StoreProvider mockStore={mock_store}>{children}</StoreProvider>
        </BrowserRouter>
    );

    beforeEach(() => {
        Object.defineProperty(window, 'matchMedia', {
            value: jest.fn(),
            writable: true,
        });
        mockOnLogout.mockClear();
    });

    it('renders the logout item and no theme toggle row', () => {
        render(<MenuContent onLogout={mockOnLogout} />, { wrapper });
        expect(screen.getByText(/Log out/)).toBeInTheDocument();
        expect(screen.queryByText(/Dark theme/)).not.toBeInTheDocument();
    });

    it('adjusts text size for mobile devices', () => {
        render(<MenuContent onLogout={mockOnLogout} />, { wrapper });
        const text = screen.getByText(/Log out/);
        expect(text).toHaveClass('derivs-text__size--md');
    });

    it('adjusts text size for desktop devices', () => {
        (useDevice as jest.Mock).mockReturnValue({ isDesktop: true });
        render(<MenuContent onLogout={mockOnLogout} />, { wrapper });
        const text = screen.getByText(/Log out/);
        expect(text).toHaveClass('derivs-text__size--sm');
    });

    it('does not render logout button when user is not logged in', () => {
        const non_logged_in_store = mockStore(mock_ws as any);
        non_logged_in_store.client.is_logged_in = false;

        const nonLoggedInWrapper = ({ children }: { children: React.ReactNode }) => (
            <BrowserRouter>
                <StoreProvider mockStore={non_logged_in_store}>{children}</StoreProvider>
            </BrowserRouter>
        );

        render(<MenuContent />, { wrapper: nonLoggedInWrapper });
        expect(screen.queryByText(/Log out/)).not.toBeInTheDocument();
    });
});
