---
name: Obsidian Command
colors:
  surface: '#131314'
  surface-dim: '#131314'
  surface-bright: '#39393a'
  surface-container-lowest: '#0e0e0f'
  surface-container-low: '#1b1b1c'
  surface-container: '#201f20'
  surface-container-high: '#2a2a2b'
  surface-container-highest: '#353436'
  on-surface: '#e5e2e3'
  on-surface-variant: '#bfc9c2'
  inverse-surface: '#e5e2e3'
  inverse-on-surface: '#313031'
  outline: '#89938d'
  outline-variant: '#3f4944'
  surface-tint: '#8dd5b9'
  primary: '#ffffff'
  on-primary: '#003829'
  primary-container: '#a8f2d4'
  on-primary-container: '#267059'
  inverse-primary: '#1e6a53'
  secondary: '#bdf4ff'
  on-secondary: '#00363d'
  secondary-container: '#00e3fd'
  on-secondary-container: '#00616d'
  tertiary: '#ffffff'
  on-tertiary: '#003824'
  tertiary-container: '#6ffbbe'
  on-tertiary-container: '#00734e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#a8f2d4'
  primary-fixed-dim: '#8dd5b9'
  on-primary-fixed: '#002117'
  on-primary-fixed-variant: '#00513d'
  secondary-fixed: '#9cf0ff'
  secondary-fixed-dim: '#00daf3'
  on-secondary-fixed: '#001f24'
  on-secondary-fixed-variant: '#004f58'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#131314'
  on-background: '#e5e2e3'
  surface-variant: '#353436'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: '600'
    lineHeight: 2.5rem
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: '500'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.5rem
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.25rem
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1rem
    letterSpacing: 0.01em
  data-display:
    fontFamily: JetBrains Mono
    fontSize: 1.75rem
    fontWeight: '500'
    lineHeight: 2rem
    letterSpacing: -0.025em
  data-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.25rem
    letterSpacing: 0em
  data-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1rem
    letterSpacing: 0.02em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 0.875rem
    letterSpacing: 0.08em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.25rem
  margin: 1rem
  margin-desktop: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system delivers a high-density, mission-critical operations environment engineered for aerospace, orbital telemetry, and industrial infrastructure monitoring. The personality is disciplined, clinical, and austere—prioritizing absolute data legibility, low eye fatigue under sustained operations, and immediate situational awareness. 

The aesthetic is grounded in industrial functionalism and dark bento modularity. It consciously strips away decorative digital tropes: no translucent materials, no blurred backdrop filters, no volumetric neon glows, and no decorative gradients. Surfaces are solid, planar, and matte. Visual weight is communicated strictly through surface brightness steps, razor-thin technical borders, micro-typography, and precise, functional color alerts. Every visual element exists to frame or relay real-time data.

## Colors

The system relies on an uncompromising dark architectural base:
- **Base Canvas (Void):** `#000000` (Pure zero-light black foundation).
- **Surface Elevation 1 (Cards & Bento Modules):** `#141415` (Solid matte carbon).
- **Surface Elevation 2 (Nested Wells / Inset Displays):** `#0B0B0C`.
- **Surface Elevation 3 (Hover / Interactive Overlays):** `#1E1E20`.
- **Structural Outlines:** `#27272A` (Uniform 1px divider and framing line).
- **Subtle Internal Dividers:** `#1D1D20`.

### Accents & Telemetry Roles
Accents are used sparingly for operational state signalling rather than ornament:
- **Primary Interactive (Action Pill):** `#B5FFE1` (Muted Mint). Applied exclusively to primary tactical commitments and active operational triggers, paired with `#000000` text for maximum contrast without luminescent wash.
- **Secondary Telemetry (SAR / Vector Feeds):** `#00E5FF` (Synthetic Aperture Radar Cyan). Dedicated to positional coordinates, radar tracks, and active signal lock.
- **Tertiary Status (Nominal Systems):** `#10B981` (Optical Emerald). Dedicated to confirmed operational health, active links, and safe nominal thresholds.
- **Warning Indicator:** `#F59E0B` (Telemetry Amber). Signifies anomalous readings, buffer limits, and critical confirmation thresholds.
- **Text Palette:** `#FFFFFF` (High emphasis), `#A1A1AA` (Medium emphasis / technical metadata), `#52525B` (Disabled / structural annotations).

## Typography

Typography enforces a strict cognitive separation between control nomenclature and operational telemetry:
- **UI Nomenclature (`Inter`):** Renders views, command inputs, modal dialogs, and navigation titles. Set with tighter tracking to maintain density without sacrificing scanning efficiency.
- **Data & Telemetry (`JetBrains Mono`):** Applied to coordinates, timestamps (UTC), vector data, sensor outputs, hex signatures, and system logs. Monospaced tabular alignment guarantees numbers never jitter or shift layout geometry during real-time streaming updates.
- All technical micro-labels and module headers utilize `label-caps` in `uppercase` tracking for rapid recognition across peripheral vision.

## Layout & Spacing

The layout is built on a mathematical Bento Command Grid that maximizes visible telemetry density while preserving unambiguous visual compartments.

### Bento Grid Infrastructure
- **Desktop (≥ 1280px):** 12-column variable bento grid with `1.25rem` gutters and outer margins. Panels span discrete programmatic units (e.g., 3-col telemetry sidecar, 6-col orbital canvas, 3-col vector list) locked to a continuous baseline height rhythm.
- **Tablet (768px – 1279px):** 6-column modular reflow, converting complex multi-card spans into 2- and 4-column balanced modules.
- **Mobile (< 768px):** Single-column stacked dashboard with persistent horizontal metrics tickers. Margins compress to `1rem` and internal card padding drops to `space-md` to preserve viewport efficiency.

Internal card content adheres strictly to an absolute 4px/8px incremental rhythm (`space-xs` through `space-xl`). Elements do not float freely; they are locked into structured interior grids or flex rows.

## Elevation & Depth

Depth is established strictly via opaque mechanical layering and high-precision line work. 

- **No Dropshadows:** Zero diffuse drop-shadows or ambient blurred spreads are permitted. Elevated floating surfaces are prohibited; UI modules live locked into the surface deck.
- **Tonal Stepping:** Inset wells (terminal streams, graphs) sit at `#0B0B0C`. Primary panels sit at `#141415`. Popovers, contextual menus, and floating target reticles sit at `#1E1E20`.
- **1px Precision Structural Outlines:** Every card, cell, and control is framed with a continuous 1px solid border (`#27272A`). 
- **Focus and Target States:** Active state focus is rendered via an unambiguous, razor-sharp 1px outer ring using `#00E5FF` or `#B5FFE1` with zero outer glow.

## Shapes

The design uses balanced, continuous squarcle geometries to counter the coldness of raw technical data while maintaining structural containment:
- **Main Bento Containers:** `rounded-2xl` (1rem / 16px) or `rounded-3xl` (1.5rem / 24px) for expansive visual regions, producing an enclosed modular look.
- **Interior Sub-wells & Panels:** `rounded-lg` (0.75rem / 12px) to form cohesive nesting inside outer cards.
- **Action Controls & Status Indicators:** `rounded-full` for all pill buttons, telemetry tag capsules, and command switches.

## Components

### Buttons
- **Primary Action (Command Pill):** High-contrast `#B5FFE1` solid background with solid `#000000` text (`Inter` medium/semi-bold). Full pill border-radius (`rounded-full`). Padding: `0.5rem 1.25rem`. Hover shifts background to `#9EF7D3`; active state scales subtly down (`scale(0.98)`).
- **Secondary / Tactical Button:** Solid `#141415` background, 1px solid `#27272A` border, `#FFFFFF` text. Hover shifts border to `#52525B` and background to `#1E1E20`.
- **Telemetry Action Button:** `JetBrains Mono` text, transparent background, 1px solid `#27272A`. Inactive text `#A1A1AA`. On active/locked state, border shifts to `#00E5FF` and text to `#00E5FF`.

### Cards & Bento Modules
- Constructed on a base of `#141415` with a 1px solid border in `#27272A`.
- Header zones feature uppercase `label-caps` metadata aligned to the left, paired with an optical status indicator (e.g., `#10B981` solid 6px dot) on the right.
- Internal telemetry displays occupy inset compartments (`#0B0B0C`) with `0.5rem` internal padding and matching border strokes.

### Chips & Telemetry Badges
- Pill-shaped (`rounded-full`), compact height (20px to 24px).
- Solid `#0B0B0C` background with 1px border matching the status color (`#10B981` nominal, `#00E5FF` active, `#F59E0B` alert) at 40% opacity.
- Typography: `data-mono-sm` in bold contrast.

### Input Fields & Terminal Prompts
- Background: `#0B0B0C` inset. Border: 1px solid `#27272A`. Border radius: `rounded-lg` (0.5rem).
- Text: `#FFFFFF` in `JetBrains Mono`. Placeholder text in `#52525B`.
- Active focus state: Border immediately converts to 1px `#00E5FF` without outline shadows.

### Checkboxes & Segmented Toggles
- Checkboxes: 16px × 16px square with 3px rounded corners. Unchecked state is `#0B0B0C` with 1px `#27272A`. Checked state is solid `#B5FFE1` with a `#000000` checkmark icon.
- Segmented Toggles: Contained within a `#0B0B0C` capsule. Selected segment uses `#1E1E20` with a 1px `#27272A` stroke and white typography; unselected items remain muted `#71717A`.

### Lists & Telemetry Feeds
- Structured row heights (32px / 40px) with zero zebra-striping. Rows separated by 1px solid `#1D1D20`.
- Data points arranged in fixed-width tabular monospaced columns (`JetBrains Mono`), right-aligned for numeric comparisons.