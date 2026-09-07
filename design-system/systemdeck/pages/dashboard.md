# Dashboard Page Overrides

> **PROJECT:** SystemDeck
> **Generated:** 2026-09-07 14:23:05
> **Page Type:** Dashboard / Data View

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** full-width (desktop app window)
- **Grid:** 12-column grid for data flexibility
- **Structure:** Header (app title, sampling status) → KPI stat cards (CPU/RAM/disks/network) → charts → process list. No landing sections.

### Spacing Overrides

- **Content Density:** High — optimize for information display

### Typography Overrides

- No overrides — use Master typography (Fira Code for numeric/KPI values)

### Color Overrides

- **Strategy:** Dark or neutral. Status colors (green/amber/red). Data-dense but scannable.
- **Status semantic:** availability = neutral/gray, ok = green, warn = amber (≥70%), crit = red (≥90%). Never color-only — pair with text/stroke style (chart rule).

### Component Overrides

- Avoid: No feedback during loading (spinner/skeleton for initial `cpu:usage`, null-baseline tick)
- Avoid: Blinking/live pulses without `prefers-reduced-motion` freeze
- Ensure: cursor, hover (150-300ms), visible focus on all interactive charts/buttons

---

## Page-Specific Components

- **Streaming Area Chart** for CPU/RAM over time (buffer 60-300s, downsample older data, pause/resume control)
- **Bullet/Gauge or bar** for current utilization per metric with numeric value always visible as text
- **Per-core utilization** as compact bar list (logical cores, labels as text)
- **Status row** with Unavailable (`null`) fields rendered as "—"/unavailable, never guessed
- Large-text current value KPI + history line (a11y: value readable without chart)

---

## Recommendations

- Effects: Real-time chart animations, alert pulse/glow, status indicator blink animation, smooth data stream updates, loading effect — all gated by `prefers-reduced-motion`
- Feedback: Show spinner/skeleton for operations > 300ms; pause/resume for streaming charts
- Charts a11y: values always visible as text, line styles (solid/dashed) plus color, ARIA live region for live values
- Canvas/WebGL required for ≥1 Hz streaming, per chart domain rules
