import { useEffect, useRef } from 'react';

type SparklineProps = {
  /** Точки истории, последняя — самая свежая. */
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  ariaLabel: string;
};

const SPIKE_STROKE = '#3b82f6';
const PULSE_FILL_ALPHA = 0.22;
const TAIL_FILL_ALPHA = 0.02;

/**
 * Streaming-area мини-график (Canvas, статичная перерисовка между снимками —
 * под prefers-reduced-motion анимации нет). История теряет прозрачность к началу.
 */
function Sparkline({
  values,
  width = 320,
  height = 32,
  color = SPIKE_STROKE,
  ariaLabel,
}: SparklineProps): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pxRatio = window.devicePixelRatio ?? 1;
    if (canvas.width !== width * pxRatio) canvas.width = width * pxRatio;
    if (canvas.height !== height * pxRatio) canvas.height = height * pxRatio;
    ctx.setTransform(pxRatio, 0, 0, pxRatio, 0, 0);

    ctx.clearRect(0, 0, width, height);
    if (values.length < 2) return;

    const step = width / (values.length - 1);
    const points = values.map((v, i) => [
      i * step,
      height - (Math.min(100, Math.max(0, v)) / 100) * height,
    ]);

    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, hexToRgba(color, TAIL_FILL_ALPHA));
    grad.addColorStop(1, hexToRgba(color, PULSE_FILL_ALPHA));

    ctx.beginPath();
    ctx.moveTo(points[0][0], height);
    for (const [x, y] of points) ctx.lineTo(x, y);
    ctx.lineTo(points[points.length - 1][0], height);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points) ctx.lineTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [values, width, height, color]);

  if (values.length < 2) return null;

  return (
    <div role="img" aria-label={ariaLabel}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: '100%', height, display: 'block' }}
      />
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default Sparkline;
