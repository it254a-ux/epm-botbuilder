import { layoutNames } from '../smc-labels';

describe('Smart money names layout', () => {
    it('keeps names apart, inside the chart, and arrows only the ones that moved', () => {
        const items = [100, 104, 108, 300].map((y, i) => ({ y, text: `Name ${i}`, color: '#fff' }));
        const out = layoutNames(items, { anchorX: 400, plotW: 700, plotH: 500 });
        for (let k = 1; k < out.length; k++) expect(out[k].y - out[k - 1].y >= 17).toBe(true);
        expect(out.every(o => o.x >= 6 && o.x < 700)).toBe(true);
        expect(out[out.length - 1].arrow === null).toBe(true);
        expect(out[1].arrow !== null).toBe(true);
    });
});
