# Sayha AI — Design System

## Brand
- **Name:** Sayha AI (سيحة) — Arabic for "cry for help / legal appeal"
- **Tagline:** O'zbekiston Huquqiy Sun'iy Intellekti

## Color Palette
- **Primary Background:** `#0D0F1A` (deep navy-black)
- **Secondary Background:** `#131629` (dark navy)
- **Card Background:** `#1A1D33` (elevated navy)
- **Border:** `#2A2D4A` (subtle navy)
- **Gold Accent:** `#C9A227` (judicial gold)
- **Gold Light:** `#E8C547` (hover gold)
- **Text Primary:** `#F0EDE4` (warm off-white)
- **Text Secondary:** `#9B97A8` (muted lavender-gray)
- **Success:** `#2ECC71`
- **Warning:** `#F39C12`
- **Danger:** `#E74C3C`

## Typography
- **Display Font:** Playfair Display (serif — authority, tradition)
- **Body Font:** Inter (clean, readable)
- **Mono Font:** JetBrains Mono (code/legal refs)

## CSS Variables (tailwind config)
```
--color-bg: #0D0F1A
--color-bg2: #131629
--color-card: #1A1D33
--color-border: #2A2D4A
--color-gold: #C9A227
--color-gold-light: #E8C547
--color-text: #F0EDE4
--color-muted: #9B97A8
```

## Layout Principles
- Full-bleed dark backgrounds
- Gold accent lines/borders for visual hierarchy
- Generous padding, breathable whitespace
- Sidebar navigation on desktop chat pages
- Legal document feel — structured, authoritative

## Component Style
- Buttons: gold fill with dark text, or outlined gold on dark
- Cards: `#1A1D33` with `1px solid #2A2D4A` border, subtle gold top-border on active
- Inputs: dark fill, gold focus ring
- Chat bubbles: user = gold tinted, AI = dark card with gold left border
- Badges: pill shape, gold for legal category tags
