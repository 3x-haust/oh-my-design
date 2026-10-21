# OMD brand kit (draft)

The mark is the opening square of the launch film: an oven-light body (orange, with an amber light at the top left and
a red light at the bottom right) and four white handles on its corners, like a selected object in a design tool.
The film uses the same mark, so the icon, avatar, favicon and film read as one system.

## Geometry
- Master grid 128. Body (27,27)–(101,101), corner radius 15.4. Handles 17.5×17.5 centred on the body corners, with a
  3.3 border. These are the film's proportions: body 0.72, handle 0.17, radius 0.15 of the mark box.
- Pixel-aligned optical masters: `web/favicon-{16,20,24,32,48}.svg`. Do not scale the 128 master below 64px.

## Colour
- Body, three layers: linear #ff8a1f → #ff4a1c (top left to bottom right); radial #ffd36a at 28%/26% (r 58%);
  radial #e0263f at 80%/80% (r 62%).
- Handles: #ffffff with a #0a0a0a border; on the dark UI ground (#131314) the border takes the ground colour.
- Single colour: `omd-mark-{black,white,light,dark}.svg`. The body and handle rings are one ink and the handle
  centres are cut through, so the silhouette survives without the gradient.

## Files
| File | Use |
|---|---|
| `omd-mark-gradient.svg`, `omd-mark-on-dark.svg` | the mark, transparent, for light / dark grounds |
| `omd-mark-{black,white,light,dark}.svg` | single-colour fallbacks |
| `omd-lockup-{light,dark}.svg` | mark + "Oh My Design" in Geist SemiBold (OFL), outlined |
| `avatar/omd-avatar-{512,1024}.png` | GitHub org/repo avatar (dark UI ground) |
| `readme/header-{light,dark}.{svg,png}` | README header, 960×240 |
| `social/github-1280x640.png`, `social/og-1200x630.png` | social preview / Open Graph (the film's end card) |
| `omd-ascii.txt`, `omd-ansi.txt` | terminal banner |
| `web/favicon.{svg,ico}`, `web/favicon-*`, `web/apple-touch-icon.png`, `web/icon-{192,512}.png`, `web/icon-maskable-512.png` | web |

## README usage
```html
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/readme/header-dark.svg">
    <img alt="Oh My Design" src="brand/readme/header-light.svg" width="480">
  </picture>
</p>
```
