import { layoutCallouts } from '../smc-labels';

const box = { plotW: 800, plotH: 500, anchorX: 400 };

describe('Smart money callout pills', () => {
    it('stand in one column, in the order of their lines, and never touch', () => {
        const items = [200, 203, 206, 400].map((y, i) => ({ y, x1: 700, text: `Name number ${i}` }));
        const out = layoutCallouts(items, box);
        expect(out.length).toBe(4);
        expect(new Set(out.map(o => o.x)).size).toBe(1);
        for (let k = 1; k < out.length; k++) expect(out[k].y).toBeGreaterThanOrEqual(out[k - 1].y + out[k - 1].h);
        expect(out.map(o => o.index)).toEqual([0, 1, 2, 3]);
    });
    it('keeps every pill inside the chart, even when the lines are at the bottom', () => {
        const items = [470, 472, 474, 476].map((y, i) => ({ y, x1: 700, text: `N${i}` }));
        const out = layoutCallouts(items, box);
        expect(Math.max(...out.map(o => o.y + o.h))).toBeLessThanOrEqual(500);
        for (let k = 1; k < out.length; k++) expect(out[k].y).toBeGreaterThanOrEqual(out[k - 1].y + out[k - 1].h);
    });
    it('the column moves left when the long names do not fit to the right of the last candle', () => {
        const out = layoutCallouts([{ y: 100, x1: 700, text: 'SELL ENTRY AREA · SUPPLY ZONE · MITIGATED' }], { ...box, anchorX: 700 });
        expect(out[0].x + out[0].w).toBeLessThanOrEqual(800);
    });
});
