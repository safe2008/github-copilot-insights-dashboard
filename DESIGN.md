# Copilot Insights Design System

A single-file design system in the [DESIGN.md](https://designmd.ai/what-is-design-md)
format. It captures the colors, typography, spacing, components, elevation, and
motion that keep the Copilot Insights dashboard consistent. Drop-in readable by
any AI coding tool and by humans. Implementation pointers for this repo are at
the end.

The UI is built with Tailwind CSS v4. Tokens below map to Tailwind utilities and
the `@theme` block in `app/src/app/globals.css`. Every color ships a light and a
dark value — always pair a utility with its `dark:` variant.

## Colors

### Brand & accent

- **Primary** (`#2563EB`, blue-600): primary buttons, links, active navigation, focus.
- **Primary Hover** (`#1D4ED8`, blue-700): hover state for primary actions.
- **Primary Tint** (`#EFF6FF`, blue-50): active nav background, subtle accent fills.

### Semantic

- **Growth / Success** (`#22C55E`): positive trends, increases, success. Tint **`#DCFCE7`**.
- **Decline / Error** (`#EF4444`): negative trends, decreases, errors. Tint **`#FEE2E2`**.
- **Attention / Warning** (`#F59E0B`): warnings, needs review. Tint **`#FEF3C7`**.
- **Neutral / Info** (`#3B82F6`): informational, in-progress. Tint **`#DBEAFE`**.

Tints are for filled backgrounds, badges, and chart fills; the base color is for
text, icons, borders, and chart strokes.

### Neutrals & text (light / dark)

- **Background** (`#F9FAFB` / `#111827`): app canvas (gray-50 / gray-900).
- **Surface** (`#FFFFFF` / `#1F2937`): cards, panels, menus (white / gray-800).
- **Border** (`#E5E7EB` / `#374151`): dividers and card outlines (gray-200 / gray-700).
- **Text Primary** (`#111827` / `#F3F4F6`): headings and body (gray-900 / gray-100).
- **Text Secondary** (`#6B7280` / `#9CA3AF`): subtitles, labels (gray-500 / gray-400).
- **Text Muted** (`#9CA3AF` / `#6B7280`): captions, meta, disabled (gray-400 / gray-500).

## Typography

GitHub's brand typefaces, self-hosted once via `next/font/local` (zero layout
shift) with the OS system stack as fallback, exposed as CSS variables that feed
the Tailwind theme. Never hardcode a `font-family`; rely on the `font-sans`
(default) and `font-mono` utilities.

- **Sans / UI (default)** — **Mona Sans**, GitHub's variable brand sans (weights
  200–900). Used for all UI and Latin scripts. Inherited from `html`; no class
  needed. Var `--font-mona-sans` → `--font-sans`.
- **Arabic & other non-Latin** — no GitHub brand face exists, so glyphs fall
  through per-glyph to the OS system font (San Francisco / Segoe UI / Noto Sans)
  via the `--font-sans` fallback stack. No special rule required.
- **Mono** — **Monaspace Neon**, GitHub's monospace superfamily. Used for code,
  identifiers, API paths, SQL/table names, and tabular values via `font-mono`.
  Var `--font-monaspace` → `--font-mono`.
- **Serif** — no brand serif; `--font-serif` maps to the OS system serif
  (`ui-serif, Georgia, …`) and is reserved for optional editorial/display text.

### Type scale

- **Hero title**: Mona Sans, 30px (`text-3xl`), Bold 700.
- **Page title (h1)**: Mona Sans, 20px (`text-xl`), Bold 700.
- **Section / card title**: Mona Sans, 14px (`text-sm`), Semibold 600.
- **KPI value**: Mona Sans, 24px (`text-2xl`), Bold 700.
- **Overline / KPI label**: Mona Sans, 12px (`text-xs`), Medium 500, `uppercase tracking-wider`.
- **Body**: Mona Sans, 14px (`text-sm`), Regular 400.
- **Caption / meta**: Mona Sans, 12px (`text-xs`), Regular 400.
- **Code / mono**: Monaspace Neon, 12px (`text-xs`).

## Spacing

Tailwind's 4px base unit. Stay on the scale: `4, 8, 12, 16, 20, 24, 32, 40px`
(`1, 2, 3, 4, 5, 6, 8, 10`).

- **Page padding**: 24px (`p-6`).
- **Card padding**: 16px (`p-4`) standard; 20px (`p-5`) for feature cards.
- **Card grid gap**: 16px (`gap-4`).
- **Inline group gap**: 8px–10px (`gap-2` / `gap-2.5`) for icon + label clusters.
- **Section rhythm**: 40px (`space-y-10`) between major landing sections; 24px (`gap-6`) elsewhere.
- **Control padding**: nav items `px-3 py-2`; primary button `px-5 py-2.5`.

## Components

- **Card**: Surface bg, 1px Border, 8px radius (`rounded-lg`), 16–20px padding,
  `shadow-xs`. Interactive cards add `transition-shadow hover:shadow-md`.
- **KPI Card**: Card containing an overline label (Text Secondary, `text-xs uppercase
  tracking-wider`), a value (`text-2xl font-bold`), and an optional subtitle
  (Text Muted, `text-xs`).
- **Primary Button**: Primary bg, white text, 14px Medium, 8px radius (`rounded-lg`),
  `px-5 py-2.5`, `shadow-xs`, `transition-colors`, hover Primary Hover.
- **Nav Item**: 6px radius (`rounded-md`), `px-3 py-2`, `text-sm font-medium`. Active =
  Primary Tint bg + Primary text (`bg-blue-50 text-blue-700`, dark `bg-blue-900/30
  text-blue-400`); idle = Text Secondary, hover `bg-gray-50`.
- **Icon Tile**: `rounded-lg p-2.5` with a semantic tint background (e.g. `bg-blue-50
  text-blue-600`, dark `bg-blue-900/30 text-blue-400`).
- **Dropdown / Menu**: Surface bg, Border, 6px radius (`rounded-md`), `py-1`,
  `shadow-lg`, `min-w-[120px]`.
- **Banner**: `rounded-lg`, `p-4`, tinted background + matching border and text from
  one semantic family (e.g. info: `bg-blue-50 border-blue-100 text-blue-800`).
- **Data Table**: sortable headers, zebra rows, in-table search, and CSV/Excel
  export; render technical cells (paths, ids) in `font-mono`.

## Elevation

Separation comes mostly from borders; shadows stay subtle and layer upward.

- **shadow-xs**: resting cards, buttons — barely-there lift.
- **shadow-md**: hovered or raised cards.
- **shadow-lg**: popovers, dropdown menus, overlays.

## Motion

Animation is powered by [GSAP](https://gsap.com/) (`gsap`) with the official React
hook [`@gsap/react`](https://gsap.com/resources/React/) (`useGSAP`), which scopes
selectors to a ref and auto-cleans on unmount.

**Principles**

- **Subtle and fast** — motion guides attention, never blocks interaction.
- **Entrance, not idle** — animate elements into view on mount; avoid looping motion.
- **Accessible** — every animation honors `prefers-reduced-motion: reduce` by
  snapping to the final state.
- **No layout shift** — `useGSAP` runs before paint, so fading from `opacity: 0`
  never flashes or reflows.

**Tokens**

- **Duration**: 0.4s (nav items) – 0.6s (blocks).
- **Easing**: `power2.out` (decelerate into place).
- **Stagger**: 0.04s–0.06s per child in lists and grids.
- **Rise offset** (`y`): 16px for fade-and-rise blocks.
- **Slide offset** (`x`): 12px, direction-aware (positive in RTL, negative in LTR).

**Reveal primitive** — `components/ui/reveal.tsx` is the reusable entrance wrapper.
Wrap a block to fade-and-rise it in, or pass `stagger` to animate its direct
children in sequence. Props: `stagger` (bool), `y` (px, default 16), `delay` (s),
`duration` (s, default 0.6).

```tsx
<Reveal stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {cards.map((c) => <Card key={c.id} {...c} />)}
</Reveal>
```

**Applied patterns**: landing hero (block reveal), landing section cards (stagger),
sidebar navigation (direction-aware slide + stagger on mount), and the shared page
header (block reveal across every report page).

## Guidelines

**Do**

- Pair every color utility with its `dark:` variant.
- Use logical Tailwind utilities so layouts mirror in Arabic RTL: `start-*`/`end-*`,
  `ps-*`/`pe-*`, `ms-*`/`me-*`, `border-s`/`border-e`.
- Use `font-mono` only for code and machine values; let everything else inherit Mona Sans.
- Guard every animation with `prefers-reduced-motion` and keep motion to entrances.
- Compose conditional classes with the `cn()` helper (clsx + tailwind-merge).

**Don't**

- Don't use physical `left`/`right` utilities — they break the RTL (Arabic) layout.
- Don't hardcode `font-family` or introduce fonts outside Mona Sans / Monaspace.
- Don't add raw hex values outside the tokens in this file.
- Don't write custom CSS files — Tailwind utilities only.
- Don't add looping, autoplay, or attention-seeking motion.

## Implementation notes (this repo)

- **Font loading**: `app/src/app/layout.tsx` (`next/font/local`, self-hosted in `app/src/app/fonts/`).
- **Font + color tokens**: `app/src/app/globals.css` (`@theme`).
- **Light/dark theming**: `app/src/lib/theme/theme-provider.tsx` (Tailwind `class` strategy).
- **Chart theming**: `app/src/lib/theme/chart-theme.ts` (`useChartOptions`).
- **Locale & direction**: `app/src/lib/i18n/locale-provider.tsx`.
- **Motion primitive**: `app/src/components/ui/reveal.tsx`.
