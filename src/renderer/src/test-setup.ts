import '@testing-library/jest-dom/vitest';

// jsdom не реализует canvas 2D: без заглушки getContext() шумит в stderr
// ("Not implemented") при отрисовке Sparkline в тестах App.
if (typeof HTMLCanvasElement !== 'undefined') {
  const ctxStub = {
    setTransform: () => {},
    clearRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {},
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
  const getContextStub = (): CanvasRenderingContext2D =>
    ctxStub as unknown as CanvasRenderingContext2D;
  const protoGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = getContextStub as unknown as typeof protoGetContext;
}
