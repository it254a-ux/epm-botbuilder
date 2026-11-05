import { positionProfits } from '../position-marker';

describe('positionProfits', () => {
    it('only the entry: nothing to show yet', () => {
        expect(positionProfits([100], 10, 100, 'BUY')).toEqual([0]);
    });

    it('BUY: higher prices make money and later points are measured from the entry', () => {
        // 10 stake x 100 multiplier x (change / entry)
        expect(positionProfits([100, 101, 102, 99], 10, 100, 'BUY')).toEqual([0, 10, 20, -10]);
    });

    it('SELL: lower prices make money, higher prices lose', () => {
        expect(positionProfits([100, 99, 98, 100.5], 10, 100, 'SELL')).toEqual([0, 10, 20, -5]);
    });

    it('the chosen side decides, not the direction of the first move', () => {
        expect(positionProfits([100, 99], 10, 100, 'BUY')[1]).toBe(-10);
        expect(positionProfits([100, 101], 10, 100, 'SELL')[1]).toBe(-10);
    });

    it('a trade cannot lose more than its stake', () => {
        expect(positionProfits([100, 101, 50], 10, 100, 'BUY')[2]).toBe(-10);
    });

    it('shows nothing for a point it cannot work out', () => {
        expect(positionProfits([100, 101], 0, 100, 'BUY')[1]).toBeNull();
    });
});
