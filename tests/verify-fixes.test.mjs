import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Read index.html and extract JavaScript
const htmlPath = new URL('../index.html', import.meta.url).pathname;
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

function setupTestEnvironment() {
    const elements = new Map();

    function createElement(id, tagName = 'div', initialProps = {}) {
        const el = {
            id,
            tagName: tagName.toUpperCase(),
            textContent: '',
            value: '',
            max: '10',
            style: {},
            innerHTML: '',
            classList: {
                classes: new Set(),
                add(c) { this.classes.add(c); },
                remove(c) { this.classes.delete(c); },
                contains(c) { return this.classes.has(c); }
            },
            ...initialProps
        };
        elements.set(id, el);
        return el;
    }

    // Populate DOM elements matching index.html
    createElement('time-control', 'input', { value: '0', max: '10' });
    createElement('time-value', 'span', { textContent: '0.00 s' });
    createElement('play-button-text', 'span', { textContent: '▶ PLAY' });
    createElement('wave-plot', 'div');
    createElement('loader', 'div');
    createElement('total-energy', 'div');
    createElement('max-amplitude', 'div');
    createElement('fundamental-freq', 'div');
    createElement('wavelength', 'div');
    createElement('phase-velocity', 'div');
    createElement('energy-ratio', 'div');
    createElement('length', 'input', { value: '10' });
    createElement('tension', 'input', { value: '100' });
    createElement('density', 'input', { value: '1' });
    createElement('wave-speed', 'input', { value: '10' });
    createElement('damping', 'input', { value: '0.01' });
    createElement('initial-condition', 'select', { value: 'sine' });
    createElement('boundary-type', 'select', { value: 'fixed' });
    createElement('wave-type', 'select', { value: 'string' });

    const modeButtons = [
        createElement('btn-disp', 'button', { 'data-mode': 'displacement' }),
        createElement('btn-vel', 'button', { 'data-mode': 'velocity' }),
        createElement('btn-energy', 'button', { 'data-mode': 'energy' }),
        createElement('btn-freq', 'button', { 'data-mode': 'frequency' })
    ];

    let nextRafId = 1;
    const rafCallbacks = new Map();
    const cancelledRafIds = new Set();

    let plotlyCalls = [];
    let plotlyRejectNext = false;

    const mockPlotly = {
        react(target, data, layout, config) {
            plotlyCalls.push({ type: 'react', target, data, layout, config });
            if (plotlyRejectNext) {
                return Promise.reject(new Error('Mock Plotly Render Failure'));
            }
            return Promise.resolve({ data, layout });
        },
        newPlot(target, data, layout, config) {
            plotlyCalls.push({ type: 'newPlot', target, data, layout, config });
            return Promise.resolve({ data, layout });
        }
    };

    const sandbox = {
        document: {
            getElementById(id) {
                return elements.get(id) || null;
            },
            querySelectorAll(selector) {
                if (selector === '.mode-btn') return modeButtons;
                return [];
            },
            querySelector(selector) {
                const match = selector.match(/\[data-mode="([^"]+)"\]/);
                if (match) {
                    return modeButtons.find(b => b['data-mode'] === match[1]) || null;
                }
                return null;
            }
        },
        window: {},
        console,
        Plotly: mockPlotly,
        parseFloat,
        Math,
        requestAnimationFrame(cb) {
            const id = nextRafId++;
            rafCallbacks.set(id, cb);
            return id;
        },
        cancelAnimationFrame(id) {
            cancelledRafIds.add(id);
            rafCallbacks.delete(id);
        },
        setTimeout: (cb, ms) => setTimeout(cb, ms),
        clearTimeout: (id) => clearTimeout(id)
    };

    sandbox.window = sandbox;

    // Extract <script> content
    const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, 'Could not find <script> block in index.html');
    const scriptCode = scriptMatch[1] + `
        // Expose internal state for test inspection
        globalThis.__getInternal = () => ({
            isPlaying,
            animationId,
            currentTime,
            currentMode,
            waveData
        });
        globalThis.__setInternal = (updates) => {
            if ('isPlaying' in updates) isPlaying = updates.isPlaying;
            if ('animationId' in updates) animationId = updates.animationId;
            if ('currentTime' in updates) currentTime = updates.currentTime;
            if ('currentMode' in updates) currentMode = updates.currentMode;
            if ('Plotly' in updates) Plotly = updates.Plotly;
        };
    `;

    vm.createContext(sandbox);
    vm.runInContext(scriptCode, sandbox);

    return {
        sandbox,
        elements,
        mockPlotly,
        getState: sandbox.__getInternal,
        setState: sandbox.__setInternal,
        getPlotlyCalls: () => plotlyCalls,
        setPlotlyRejectNext: (v) => { plotlyRejectNext = v; },
        cancelledRafIds,
        // Fire the frame animate() queued. Without this the loop body runs
        // exactly once per startAnimation(), so every fix inside animate() --
        // the max-time reset, the catch that pauses -- could be deleted with
        // the suite still green.
        pumpFrame() {
            // Oldest first, and assert the queue never holds more than one.
            // Taking the newest would hide exactly the bug this helper exists
            // to expose: an orphaned frame that startAnimation's isPlaying
            // guard failed to cancel would park at the head forever while the
            // suite stayed green.
            assert.ok(rafCallbacks.size <= 1,
                `animate queued ${rafCallbacks.size} frames; at most one should be outstanding`);
            const [id, cb] = [...rafCallbacks.entries()].shift() ?? [];
            if (cb === undefined) return false;
            rafCallbacks.delete(id);
            cb();
            return true;
        }
    };
}

test('Finding 1: updateSliderValue resolves time-control to time-value span without throwing TypeError', () => {
    const { sandbox, elements } = setupTestEnvironment();
    const slider = elements.get('time-control');
    const span = elements.get('time-value');

    slider.value = '3.75';
    assert.doesNotThrow(() => {
        sandbox.updateSliderValue(slider);
    });

    assert.equal(span.textContent, '3.75 s');
});

test('Finding 1: updateSliderValue handles non-existent span gracefully', () => {
    const { sandbox } = setupTestEnvironment();
    assert.doesNotThrow(() => {
        sandbox.updateSliderValue({ id: 'non-existent', value: '1.23' });
    });
});

test('Finding 3: startAnimation is idempotent and toggleAnimation handles play/pause toggle', () => {
    const { sandbox, elements, getState } = setupTestEnvironment();
    const playBtnText = elements.get('play-button-text');

    sandbox.initializeWave();
    assert.equal(getState().isPlaying, false);

    // Initial toggle starts playback
    sandbox.toggleAnimation();
    assert.equal(getState().isPlaying, true);
    assert.equal(playBtnText.textContent, '❚❚ PAUSE');

    const firstAnimId = getState().animationId;
    assert.ok(firstAnimId, 'animationId should be set');

    // Idempotent startAnimation should not invert or re-create loop
    sandbox.startAnimation();
    assert.equal(getState().isPlaying, true);
    assert.equal(getState().animationId, firstAnimId, 'animationId should not be changed on idempotent start');

    // Toggle again pauses playback
    sandbox.toggleAnimation();
    assert.equal(getState().isPlaying, false);
    assert.equal(getState().animationId, null);
    assert.equal(playBtnText.textContent, '▶ PLAY');
});

test('Finding 2 & 4 & 11: visualizeWave uses Plotly.react unconditionally and catches async rejections', async () => {
    const { sandbox, getState, setState, getPlotlyCalls, setPlotlyRejectNext } = setupTestEnvironment();

    sandbox.initializeWave();
    sandbox.visualizeWave();

    const calls = getPlotlyCalls();
    assert.ok(calls.length > 0, 'Plotly.react should have been called');
    assert.equal(calls[0].type, 'react');
    assert.equal(calls[0].target, 'wave-plot');

    // Verify rejection handling halts animation
    setState({ isPlaying: true });
    setPlotlyRejectNext(true);

    sandbox.visualizeWave();

    // Give microtask queue time to process rejection .catch()
    await new Promise(r => setTimeout(r, 10));
    assert.equal(getState().isPlaying, false, 'Animation should be paused when Plotly.react rejects');
});

test('Finding 5: Plotly layout resets autorange and showlegend across mode switches', () => {
    const { sandbox, getPlotlyCalls } = setupTestEnvironment();

    sandbox.initializeWave();

    // Switch to displacement
    sandbox.switchMode('displacement');
    let calls = getPlotlyCalls();
    let lastLayout = calls[calls.length - 1].layout;
    assert.equal(lastLayout.yaxis.range[0], -0.15);
    assert.equal(lastLayout.yaxis.range[1], 0.15);
    assert.equal(lastLayout.showlegend, false);

    // Switch to energy mode
    sandbox.switchMode('energy');
    calls = getPlotlyCalls();
    lastLayout = calls[calls.length - 1].layout;
    assert.equal(lastLayout.yaxis.autorange, true);
    assert.equal(lastLayout.showlegend, true);

    // Switch to velocity mode
    sandbox.switchMode('velocity');
    calls = getPlotlyCalls();
    lastLayout = calls[calls.length - 1].layout;
    assert.equal(lastLayout.yaxis.autorange, true);
    assert.equal(lastLayout.showlegend, false);
});

test('Finding 6: Missing Plotly shows UI error and halts animation', () => {
    const { sandbox, elements, getState, setState } = setupTestEnvironment();
    setState({ Plotly: undefined, isPlaying: true });

    sandbox.visualizeWave();

    assert.equal(getState().isPlaying, false, 'Animation should halt when Plotly is missing');
    const plotDiv = elements.get('wave-plot');
    assert.match(plotDiv.innerHTML, /Plotly\.js failed to load/);
});

test('Finding 7: switchMode rejects unrecognized modes without throwing', () => {
    const { sandbox, getState } = setupTestEnvironment();
    assert.doesNotThrow(() => {
        sandbox.switchMode('invalid-mode');
    });
    assert.notEqual(getState().currentMode, 'invalid-mode');
});

test('Finding 13: updateTimeEvolution triggers on single dt step (0.01s)', () => {
    const { sandbox, elements, getState, setState } = setupTestEnvironment();
    sandbox.initializeWave();
    setState({ currentTime: 0 });

    const slider = elements.get('time-control');
    slider.value = '0.01';

    sandbox.updateTimeEvolution(slider);
    assert.equal(getState().currentTime, 0.01);
});

test('Finding 14: calculateWaveProperties handles zero energy without NaN', () => {
    const { sandbox, elements, getState } = setupTestEnvironment();
    sandbox.initializeWave();
    // Force zero energy
    getState().waveData.u.fill(0);
    getState().waveData.v.fill(0);

    sandbox.calculateWaveProperties();

    const energyRatio = elements.get('energy-ratio');
    assert.equal(energyRatio.textContent, '0.00');
    assert.notEqual(energyRatio.textContent, 'NaN');
});

test('HTML verification: dead plot divs removed and data-mode added', () => {
    assert.ok(!htmlContent.includes('id="frequency-plot"'), 'frequency-plot should be removed');
    assert.ok(!htmlContent.includes('id="energy-plot"'), 'energy-plot should be removed');
    assert.ok(htmlContent.includes('data-mode="displacement"'), 'data-mode="displacement" should exist');
    assert.ok(htmlContent.includes('onclick="toggleAnimation()"'), 'toggleAnimation onclick should exist');
});

test('animate resets the loop when currentTime passes the slider max', () => {
    const { sandbox, elements, setState, getState, pumpFrame } = setupTestEnvironment();

    sandbox.initializeWave();
    elements.get('time-control').max = '10';
    setState({ currentTime: 9.999, isPlaying: false });

    sandbox.startAnimation();
    assert.equal(pumpFrame(), true, 'startAnimation must queue a frame to pump');

    // Enough frames to carry currentTime past max=10 and wrap it.
    for (let i = 0; i < 40 && getState().currentTime > 1; i++) pumpFrame();

    assert.ok(getState().currentTime < 1,
        `currentTime should wrap to ~0 past the max, got ${getState().currentTime}`);
    // Not `waveData.x.length > 0` -- initializeWave() above already satisfies
    // that, so it would pass with the reset deleted. The slider is what the
    // reset writes through, so read it back instead.
    assert.ok(parseFloat(elements.get('time-control').value) < 1,
        'the slider should follow currentTime back to the start of the loop');
});

test('animate pauses playback when the loop body throws', () => {
    const { sandbox, setState, getState, pumpFrame, elements } = setupTestEnvironment();

    sandbox.initializeWave();
    sandbox.startAnimation();
    assert.equal(getState().isPlaying, true);

    // Remove a stat element calculateWaveProperties writes to unguarded, so the
    // next frame throws inside the try.
    elements.delete('total-energy');
    pumpFrame();

    assert.equal(getState().isPlaying, false, 'a throw inside animate must pause playback');
    assert.equal(elements.get('play-button-text').textContent, '▶ PLAY');
});

test('switchMode moves the active class using the element the caller passes', () => {
    const { sandbox, elements } = setupTestEnvironment();
    const disp = elements.get('btn-disp');
    const energy = elements.get('btn-energy');

    sandbox.initializeWave();

    // Production always passes the clicked element (index.html:695-698); every
    // other test in this file passes one argument and so exercises only the
    // querySelector fallback.
    sandbox.switchMode('displacement', disp);
    assert.equal(disp.classList.contains('active'), true);

    sandbox.switchMode('energy', energy);
    assert.equal(energy.classList.contains('active'), true, 'the clicked element must gain active');
    assert.equal(disp.classList.contains('active'), false, 'the previous button must lose active');

    // The passed element wins over the data-mode lookup. Without this the two
    // branches are indistinguishable, since the button the caller clicks is
    // normally the one the selector would find anyway -- which is why dropping
    // the parameter entirely used to leave the suite green.
    sandbox.switchMode('velocity', disp);
    assert.equal(disp.classList.contains('active'), true,
        'switchMode must use the element it was passed, not the data-mode lookup');
    assert.equal(elements.get('btn-vel').classList.contains('active'), false);
});
