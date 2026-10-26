import '@testing-library/jest-dom'
import '@testing-library/jest-dom/extend-expect'

global.console.error = jest.fn()

interface KeyboardIterator extends Iterator<[string, string]> {
    length: number
    [key: number]: [string, string]
}

interface KeyboardMap {
    entries: () => KeyboardIterator
}

// some tests are not executed with dom so won't have navigator property defined
if (global.navigator)
    global.navigator.keyboard = {
        getLayoutMap: () =>
            Promise.resolve(<KeyboardMap>({
                entries: () => [] as unknown as [string, string],
            } as unknown as KeyboardMap)),
    }

if (typeof HTMLCanvasElement !== 'undefined') {
    const mockContext = {
        font: '',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        measureText: (text: string) => ({
            width: text.length * 8,
        }),
        rect: jest.fn(),
        save: jest.fn(),
        restore: jest.fn(),
        fill: jest.fn(),
        stroke: jest.fn(),
        fillRect: jest.fn(),
        strokeRect: jest.fn(),
        clearRect: jest.fn(),
        translate: jest.fn(),
        scale: jest.fn(),
        drawImage: jest.fn(),
        beginPath: jest.fn(),
        closePath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        clip: jest.fn(),
        fillText: jest.fn(),
        canvas: document.createElement('canvas'),
    }

    HTMLCanvasElement.prototype.toDataURL = jest.fn(() => 'data:image/png;base64,')
    HTMLCanvasElement.prototype.getContext = (() =>
        mockContext) as unknown as typeof HTMLCanvasElement.prototype.getContext
}
// Mock element dimensions for virtualized list tests in JSDOM.
if (typeof HTMLElement !== 'undefined') {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get() {
            return 600
        },
    })

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get() {
            return 800
        },
    })

    HTMLElement.prototype.getBoundingClientRect = function () {
        return {
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 800,
            bottom: 600,
            width: 800,
            height: 600,
            toJSON: () => ({}),
        } as DOMRect
    }
}
