---
name: "Breeze — Aapka PG"
description: "Clean consumer light-mode design system with Figtree typography, crisp hairline borders, pill buttons, and a single deep-blue primary accent."
---

## Overview

Breeze is a clean consumer design system built for **Aapka PG**, a residential PG (Paying Guest) management application for owners, managers, and tenants. The interface pairs a crisp white canvas (`#FFFFFF`) and soft neutral fields (`#F3F5F7`) with high-contrast ink typography (`#181A1C`) and a single committed deep-blue primary accent (`#003B95`). Friendly rounded geometry, pill controls, and generous breathing room keep dense operational tasks—rent collection, bed setup, and tenant onboarding—calm and scannable.

## Colors

The palette centers on a single authoritative primary (`#003B95`) for committed actions, active tabs, and key figures, supported by warm terracotta (`#E07D47`) and fresh green (`#4EAC6D`) accents and semantic status hues.

- **Primary (`#003B95`):** Committed actions, active navigation pills, links, and hero financial cards.
- **Primary Soft (`#EBF3FF`):** Tinted chips, selected filter pills, and soft action buttons.
- **Surface (`#FFFFFF`) & Surface 2 (`#F3F5F7`):** Crisp white cards over subtle light-gray inset panels and form fields.
- **Ink (`#181A1C`) & Ink 2 (`#66686D`):** Primary headings/values and secondary metadata/labels.
- **Semantic Status:** Success (`#159A49`), Warning (`#C97D00`), and Danger (`#D32F34`) paired with soft tinted backgrounds for badges and destructive actions.

```yaml
colors:
  primary: "#003B95"
  on-primary: "#FFFFFF"
  primary-soft: "#EBF3FF"
  on-primary-soft: "#003B95"
  secondary: "#E07D47"
  on-secondary: "#181A1C"
  tertiary: "#4EAC6D"
  on-tertiary: "#181A1C"
  background: "#FFFFFF"
  on-background: "#181A1C"
  surface: "#FFFFFF"
  on-surface: "#181A1C"
  surface-2: "#F3F5F7"
  on-surface-2: "#181A1C"
  ink: "#181A1C"
  ink-2: "#66686D"
  line: "#E2E4E7"
  inverse: "#1C1E20"
  on-inverse: "#FFFFFF"
  success: "#159A49"
  success-soft: "#E8F7EE"
  on-success-soft: "#0F7A38"
  warning: "#C97D00"
  warning-soft: "#FFF4E0"
  on-warning-soft: "#8F5700"
  danger: "#D32F34"
  on-danger: "#FFFFFF"
  danger-soft: "#FDECEC"
  on-danger-soft: "#B71C21"
```

## Typography

**Figtree** (Google Fonts) serves across all display, headline, body, and label roles, providing friendly geometric clarity and crisp `tabular-nums` alignment for currency (`₹`) and bed counts.

```yaml
typography:
  display-lg:
    fontFamily: "Figtree"
    fontSize: 36px
    fontWeight: 700
    lineHeight: 42px
    letterSpacing: -0.5px
  display-lg-mobile:
    fontFamily: "Figtree"
    fontSize: 28px
    fontWeight: 700
    lineHeight: 34px
    letterSpacing: -0.25px
  headline-lg:
    fontFamily: "Figtree"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 30px
    letterSpacing: -0.25px
  headline-md:
    fontFamily: "Figtree"
    fontSize: 18px
    fontWeight: 700
    lineHeight: 24px
    letterSpacing: -0.1px
  title-md:
    fontFamily: "Figtree"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 22px
    letterSpacing: 0px
  body-md:
    fontFamily: "Figtree"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0px
  body-sm:
    fontFamily: "Figtree"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0px
  label-lg:
    fontFamily: "Figtree"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
    letterSpacing: 0px
  label-sm:
    fontFamily: "Figtree"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.1px
```

## Layout & Spacing

Desktop screens center a focused single-column application shell (`max-w-lg` / `540px`) on a clean `#F3F5F7` or `#FFFFFF` backdrop, with a consistent top profile bar and sticky bottom tab navigation. Spacing follows a strict 4px/8px rhythm.

```yaml
spacing:
  gutter-xs: 4px
  gutter-sm: 8px
  gutter-md: 16px
  gutter-lg: 24px
  gutter-xl: 32px
  section: 24px
  page-margin: 24px
```

## Elevation & Depth

Breeze relies on clean surface contrast (`#FFFFFF` cards over `#F3F5F7` canvas or `#FFFFFF` with `1px solid #E2E4E7` hairline borders) and subtle ambient shadows (`0 1px 3px rgba(24, 26, 28, 0.05)`) rather than heavy drop shadows.

## Shapes

Generous, friendly corner radii unify the system: `12px` (`md`) for inputs and list rows, `16px` (`lg`) for cards and panels, and `9999px` (`full`) for pill buttons, status chips, and active navigation indicators.

```yaml
rounded:
  sm: 8px
  DEFAULT: 12px
  md: 12px
  lg: 16px
  xl: 24px
  full: 9999px
```

## Motion & Micro-interaction

Transitions are crisp and immediate, animating only opacity, transform, and color.

```yaml
motion:
  state-change:
    duration: 120ms
    delay: 0ms
    timingFunction: ease-out
  surface-enter:
    duration: 200ms
    delay: 0ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
```

## Voice & Content Strategy

Copy is written in clear, natural **Hinglish** (Roman-script Hindi + English terms) matching everyday PG operations in India: `Kiraya`, `Deposit`, `Bijli rate`, `Khaali bed`, `Bhare Bed`, `Save karo`, `Hatao`, `Wapas`. Currency uses the Indian Rupee symbol (`₹`) with comma grouping (`₹7,500`, `₹42,500`) and `tabular-nums`.

## Components

Component implementations live as individual HTML sticker sheet files in
`components/`. Each file contains the canonical, styled HTML components with
`<!-- COMPONENT: name -->` comment markers. Read each file before use.

- **Button** → `@components/button.html`: `button-primary`, `button-icon`, `button-with-icon`
- **Card** → `@components/card.html`: `card-elevated`, `card-action`, `card-interactive`, `card-interactive-2`
- **Chip** → `@components/chip.html`: `chip-action`, `chip-input`, `chip-with-icon`
- **Input Field** → `@components/input-field.html`: `input-field-text`, `input-field-icon`
