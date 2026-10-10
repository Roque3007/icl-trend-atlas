# ICL Trend Atlas: interaction specification

## 1. Dynamic layout guardrails

- The interface uses a flat, document-like visual system: white and neutral surfaces, square rules, restrained type, and no decorative gradients, shadows, or ambient effects.
- The comparison and evidence views retain their master-detail layouts because those arrangements support analysis. Panels are separated by rules rather than floating cards.
- The screening view is a compact methods table. Inputs, procedures, and outputs are visible at a glance; implementation filenames remain available in native disclosure rows.
- Color is reserved for data encoding, selection, and focus. The palette uses muted, print-compatible tones.
- Hover does not move, scale, rotate, or magnetically attract interface elements. Tooltips remain available where they expose chart values.
- No content depends on animation. Layout, controls, and source links remain fully usable with CSS or JavaScript motion disabled.

## 2. Transition curves

- No decorative entrance, ambient, hover, panel, or chart-drawing animation is used.
- Tab changes and disclosure changes are immediate.
- Browser-native scrolling is used; no custom easing curve is applied.

## 3. Exact triggers

- **Tab selection:** changes the active research view immediately and preserves the selected trajectory.
- **Group, paper, or trajectory selection:** updates the associated evidence without spatial movement.
- **Chart pointer or keyboard focus:** shows the exact point value without scaling or animating the point.
- **Methods file disclosure:** opens a native `details` element containing the implementation filenames for that stage.
- **Reduced motion:** produces the same presentation because the interface contains no nonessential motion.
