# TenTwenty Farms — Shopify Frontend Assessment

Custom Shopify theme work on **Horizon**, implementing the TenTwenty Farms banner and Quality Products coverflow from the shared design references, plus a small farm catalog.

## Store

- Preview: https://931uff-1y.myshopify.com/
- Password: `one`

## What’s included

### Custom sections (theme editor ready)

1. **TenTwenty Farms Banner** (`sections/tentwenty-farms-banner.liquid`)
   - Full-bleed slides, wipe transition, synced zoom, Next thumbnail with perimeter progress stroke
   - Merchant controls: slides (desktop/mobile images), autoplay, wipe duration, zoom, layout

2. **Quality Products** (`sections/tentwenty-quality.liquid`)
   - GSAP coverflow, drag / click direction, inverted hover ring, KCA-style text reveal
   - Merchant controls: unlimited slides, autoplay on/off (solid ring when off), gap, tilt, colours

### Catalog

- 6 sample products with variants (size / colour / pack)
- Collections: Featured Harvest, Vegetables, Flowers, Herbs & Microgreens, Shop All
- Homepage: category list + featured products; collection pages with filtering/sorting enabled

## Local preview (optional)

Vanilla HTML/CSS/JS mirrors used while building motion:

- `index.html` — banner
- `quality-slider.html` — coverflow

## Approach (short)

- Motions matched from the shared Vimeo / Figma intent; Shopify sections wrap the same behaviour with Admin-editable content.
- Copy/images live in section settings and blocks so content can change without code.
- GSAP used for coverflow and text reveal; banner wipe/progress stays on rAF for sync with the stroke.
- SEO: semantic headings, alt text on slides/products, descriptive aria labels on carousels.

## Theme assets path

Shopify files live under `shopify/` and are deployed to the live Horizon theme.
