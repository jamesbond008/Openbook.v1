# James Reading OS DESIGN.md

## 1. Visual Theme & Atmosphere

James Reading OS should feel like a reading-first knowledge workbench, not a dashboard and not a generic AI landing page. The mood combines Notion-style editorial warmth with Mintlify-style documentation clarity. The canvas is warm off-white instead of cool gray. Cards feel like translucent paper sheets with very soft borders and restrained shadows. Accent color should stay sparse and purposeful: green for knowledge flow and blue for navigation or secondary interaction.

Key characteristics:
- Warm paper-like background, not flat gray
- Large serif display headlines for reading gravitas
- Sans-serif body text for clarity and speed
- Mono micro-labels for system states and metadata
- Soft glass cards with whisper borders
- Rounded, editorial containers instead of rigid rectangles
- Quiet gradients in hero sections only

## 2. Color Palette & Roles

- Paper: `#fcfbf8`
- Paper Strong: `#f6f4ef`
- Ink: `#1f1d1a`
- Muted Text: `#6f6a63`
- Muted Soft: `#9d968c`
- Border: `rgba(31, 29, 26, 0.08)`
- Brand Green: `#18b46a`
- Brand Green Deep: `#128452`
- Brand Green Soft: `#e6f7ee`
- Reading Blue: `#0d74ce`
- Reading Blue Soft: `#eff7ff`
- Violet Soft: `#f4efff`
- Amber Soft: `#fff6df`

Rules:
- Do not spray saturated colors across the page.
- Use green for success, flow, vault, syncing.
- Use blue for navigation, link accents, secondary highlights.
- Use warm neutrals for most surfaces.

## 3. Typography Rules

- Display font: elegant serif stack such as `"Iowan Old Style", "Palatino Linotype", Georgia, serif`
- Body font: `Inter, Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif`
- Mono font: `SF Mono, IBM Plex Mono, Menlo, monospace`

Hierarchy:
- Hero headline: large serif, tight spacing, confident but calm
- Section heading: serif, medium-large, high contrast
- Card titles: sans or serif depending on context, semibold
- Body copy: 16px to 18px, comfortable line height
- Labels and badges: mono or tightly tracked uppercase micro-text

## 4. Components

### Hero
- Rounded 28px to 32px panel
- Soft atmospheric gradients only in hero
- Large serif heading
- Search input feels embedded in a premium documentation product

### Cards
- Background should be white or translucent white
- Border should be subtle and warm, never harsh gray
- Shadows should be barely-there ambient shadows
- Hover states should lift gently, not jump

### Buttons
- Primary buttons: deep ink background, white text, full pill or soft rounded shape
- Secondary buttons: white background, subtle border, muted text
- Avoid loud gradients on buttons

### Tables
- Should read like a knowledge ledger
- Header row uses warm tinted background
- Rows highlight softly on hover

## 5. Layout Principles

- Let major sections breathe with generous vertical spacing
- Keep max width readable, around 1200px
- Use 2-column layouts for summary + quote, or summary + action panel
- Do not let every section look identical

## 6. Do and Don't

Do:
- Make the interface feel calm, literate, and useful
- Use whitespace to separate ideas
- Let content hierarchy lead the visuals

Don't:
- Don't make the page feel like a crypto dashboard
- Don't use heavy borders or default gray cards everywhere
- Don't turn every section into the same white box with the same badge treatment
