# ICL Trend Atlas — Motion Specification

## 1. Dynamic layout guardrails

- The product uses a stable master–detail frame: trend groups on the left, matching papers and trajectories in the center, and a trajectory inspector on the right.
- The primary research workspace is divided into two persistent tabs. “Trajectory comparison” keeps the aggregate field and selected trajectory side by side; “Evidence explorer” keeps category, paper, and shot-level evidence in one master–detail frame.
- The new trajectory field is a working surface, not decoration. Its controls remain above the canvas and wrap on small screens.
- Content remains readable before animation begins. Motion enhances state changes and never makes the interface dependent on hover.
- Animate only `transform`, `opacity`, canvas drawing progress, and composited effects. Never animate layout dimensions.
- Dense overview lines stay quiet until hovered or selected. The median remains the strongest visual anchor.
- Ambient motion pauses when the document is hidden. Every animated behavior has a non-animated equivalent under `prefers-reduced-motion: reduce`.
- Resize observers, pointer handlers, animation frames, and intersection observers are cleaned up on unmount.

## 2. Transition curves

- Primary entrance and panel transitions: `cubic-bezier(0.22, 1, 0.36, 1)` over 420–700ms.
- Fast selection and hover feedback: `cubic-bezier(0.25, 1, 0.5, 1)` over 180–240ms.
- Tactile button release and selected-trajectory emphasis: `cubic-bezier(0.34, 1.56, 0.64, 1)` over 260–320ms.
- Ambient gradient drift: `cubic-bezier(0.45, 0, 0.55, 1)` over 16–22s, alternating.
- Canvas line introduction: quartic ease-out, `1 - (1 - t)^4`, over 800ms.

## 3. Exact triggers

- **Initial load / in view:** the headline, trajectory field, explorer, and lower guidance reveal once; observers disconnect after reveal.
- **Workspace tab change:** the selected panel enters with a 220ms opacity/translate transition while preserving the selected trajectory across both views. Keyboard focus remains on the activated tab.
- **Trajectory-field hover:** the nearest trajectory brightens while unrelated curves reduce opacity; the tooltip follows the nearest plotted point without causing reflow.
- **Trajectory-field click:** the matching I/O family, paper, and trajectory become active, then the existing explorer scrolls into view.
- **Trajectory-field filter or scale change:** the canvas redraws using the fast curve; controls provide immediate pressed-state feedback. The logarithmic shot view uses `log(1 + shots)` so zero-shot evidence remains anchored and no point disappears during the transition.
- **Coverage-audit reveal:** paper-weighted gap cards enter once with the standard in-view mask; the cards remain static after reveal so their ranking is easy to scan.
- **Lens change:** group rows refresh with a short stagger while the master–detail frame stays spatially anchored.
- **Group row hover / keyboard focus:** a 2px depth lift clarifies clickability without moving surrounding content.
- **Paper expansion:** trajectories reveal with a masked vertical fade while the paper header stays anchored.
- **Trajectory selection:** the inspector updates and the individual chart draws once in shot-count order.
- **Chart point hover / focus:** the point scales and its tooltip fades in within 140ms.
- **Reduced motion:** all transforms, ambient movement, stagger delays, and chart drawing collapse to immediate state changes; opacity transitions stay at or below 80ms.
