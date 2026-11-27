import { layoutCallouts } from '../smc-labels';

const box = { plotW: 800, plotH: 500 };

describe('Smart money names', () => {
    it('a short line gets its name from its start, just above it', () => {
        const [p] = layoutCallouts([{ y: 200, x0: 100, x1: 150, text: 'MAJOR INDUCEMENT ( TRAP )' }], box);
        expect(p.x).toBe(102);
        expect(p.y).toBeLessThan(200);
    });
    it('a long line gets its name at its right end', () => {
        const [p] = layoutCallouts([{ y: 200, x0: 0, x1: 700, text: 'BOS' }], box);
        expect(p.x + p.w).toBeLessThanOrEqual(700);
        expect(p.x).toBeGreaterThan(600);
    });
    it('names that would meet are lifted apart, and stay inside the chart', () => {
        const items = [200, 203, 206].map((y, i) => ({ y, x0: 0, x1: 700, text: `Name number ${i}` }));
        const out = layoutCallouts(items, box).sort((a, b) => a.y - b.y);
        for (let k = 1; k < out.length; k++) expect(out[k].y).toBeGreaterThanOrEqual(out[k - 1].y + out[k - 1].h);
        expect(out.every(o => o.y >= 0 && o.x >= 0 && o.x + o.w <= 800)).toBe(true);
    });
});
