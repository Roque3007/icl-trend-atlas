# ICL Trend Atlas — Motion Specification

## 1. Dynamic layout guardrails

- The product uses a stable master–detail frame: trend groups on the left, matching papers and trajectories in the center, and a trajectory inspector that enters from the right. Motion must preserve this information hierarchy.
- Content remains readable before animation begins. Motion enhances state changes; it never hides essential controls or makes the interface dependent on hover.
- Animate only `transform`, `opacity`, canvas drawing progress, and CSS custom properties that feed composited effects. Do not animate layout dimensions, positional offsets, or other reflow-heavy properties.
- Ambient motion stays behind the interface at low contrast. It pauses when the document is hidden and is fully disabled under `prefers-reduced-motion`.
- Selected rows use a restrained depth shift and color wash. Paper and trajectory lists remain spatially anchored so users do not lose their place while drilling down.
- Desktop uses a three-layer master–detail composition. Tablet collapses the inspector into an overlay. Mobile turns drill-downs into full-width sheets with a persistent back affordance.

## 2. Transition curves

- Primary entrance and panel transitions: `cubic-bezier(0.22, 1, 0.36, 1)` over 420–560ms.
- Fast selection feedback: `cubic-bezier(0.25, 1, 0.5, 1)` over 180–240ms.
- Tactile button release: `cubic-bezier(0.34, 1.56, 0.64, 1)` over 320ms.
- Ambient gradient drift: `cubic-bezier(0.45, 0, 0.55, 1)` over 16–22s, alternating.
- Chart line draw and point reveal: `cubic-bezier(0.16, 1, 0.3, 1)` over 700ms.

## 3. Exact triggers

- **Initial load:** headline, lens controls, summary figures, and group rows reveal in a 45ms stagger. The active distribution bar draws from left to right.
- **Lens change (Task / Model / Metric / Pattern):** existing rows soften and translate 6px; new rows replace them with a short stagger while preserving the selected group when possible.
- **Group row hover / keyboard focus:** a cursor-relative highlight and 2px depth lift clarify clickability. Keyboard focus receives the same treatment without magnetic cursor behavior.
- **Group selection:** the center panel crossfades and shifts 10px. Matching paper groups reveal sequentially; the selected row emits a short accent sweep toward the detail region.
- **Paper expansion:** trajectories reveal with a masked vertical fade. The paper header stays anchored.
- **Trajectory selection:** the inspector enters from the right; the chart draws once, then data points resolve in shot-count order. Switching trajectories crossfades chart labels before redrawing the line.
- **Chart point hover / focus:** the point scales to 1.12 and the tooltip fades in within 140ms. No continuous cursor-following tooltip animation.
- **Scroll / in-view:** lower explanatory sections reveal once through a cleaned-up `IntersectionObserver`. No scroll-linked parallax is used inside dense data tables.
- **Reduced motion:** all transforms, ambient movement, stagger delays, and chart drawing collapse to immediate state changes; opacity transitions remain at or below 80ms.

