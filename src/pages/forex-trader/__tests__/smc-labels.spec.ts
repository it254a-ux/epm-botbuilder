import { layoutCallouts } from '../smc-labels';

const box = { plotW: 800, plotH: 500 };

describe('Smart money names', () => {
    it('a long line gets a box as long as the line, with the name inside', () => {
        const [p] = layoutCallouts([{ y: 200, x0: 100, x1: 600, text: 'BOS', box: true }], box);
        expect(p.x).toBe(100);
        expect(p.w).toBe(500);
        expect(p.y).toBe(200);
    });
    it('a short line gets a box long enough for its name, from the start of the line', () => {
        const [p] = layoutCallouts([{ y: 200, x0: 100, x1: 150, text: 'MAJOR INDUCEMENT ( TRAP )', box: true }], box);
        expect(p.x).toBe(100);
        expect(p.w).toBeGreaterThan(150);
    });
    it('the zone name is written inside the visible part of the zone, without a box', () => {
        const [p] = layoutCallouts([{ y: 300, x0: -200, x1: 600, text: 'SELL ENTRY AREA', box: false }], box);
        expect(p.box).toBe(false);
        expect(p.x).toBeGreaterThan(100);
        expect(p.x + p.w).toBeLessThan(600);
    });
    it('boxes that would meet are moved apart, inside the chart', () => {
        const items = [200, 203, 206].map((y, i) => ({ y, x0: 0, x1: 700, text: `Name ${i}`, box: true }));
        const out = layoutCallouts(items, box).sort((a, b) => a.y - b.y);
        for (let k = 1; k < out.length; k++) expect(out[k].y).toBeGreaterThanOrEqual(out[k - 1].y + out[k - 1].h);
        expect(out.every(o => o.y >= 0 && o.y <= 500)).toBe(true);
    });
});
