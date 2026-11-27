import { braceSide, layoutBraces } from '../smc-labels';

describe('Smart money names layout', () => {
    it('keeps names that would meet apart, inside the chart', () => {
        const items = [100, 104, 300].map((y, i) => ({ y, x0: 50, x1: 400, text: `Name ${i}`, brace: true, dir: 1 as const }));
        const out = layoutBraces(items, { plotW: 700, plotH: 500 });
        expect(out.length).toBe(3);
        expect(out[0].nameY).toBeGreaterThan(out[0].line);
        expect(out[1].nameY - out[0].nameY >= 14).toBe(true);
        expect(out.every(o => o.nameX >= 4 && o.nameX < 700)).toBe(true);
    });
    it('a line in free space gets a plain name at the right, no brace', () => {
        const out = layoutBraces([{ y: 200, x0: 50, x1: 600, text: 'IL-1', brace: false, dir: 1 }], { plotW: 700, plotH: 500 });
        expect(out[0].brace).toBe(false);
        expect(out[0].nameX).toBeGreaterThan(300);
    });
    it('a long line never gets a brace, even when candles touch it', () => {
        expect(braceSide(100, [{ x: 10, top: 80, bottom: 118 }], 900, 400).brace).toBe(false);
    });
    it('a brace is used only where candles are on the line, on the side with room', () => {
        expect(braceSide(100, [{ x: 10, top: 150, bottom: 180 }]).brace).toBe(false);
        const through = braceSide(100, [{ x: 10, top: 80, bottom: 118 }, { x: 20, top: 110, bottom: 130 }]);
        expect(through.brace).toBe(true);
        expect(through.dir).toBe(-1); // the candles are below the line, so the room is above
        expect(braceSide(100, [{ x: 10, top: 60, bottom: 125 }]).dir).toBe(1); // candles above: the room is below
    });
});
