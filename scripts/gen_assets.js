// Generates the FicheDeMaire brand mark → favicon.svg + raster icon set.
// The mark: an écharpe tricolore (mayoral sash) with a gold fringe (frange dorée),
// on an ivory civic card. Run: node scripts/gen_assets.js
const { Resvg } = require("@resvg/resvg-js");
const fs = require("fs");
const path = require("path");

const PUB = path.join(__dirname, "..", "public");
const KIT = path.join(PUB, "kit");
const BLEU = "#000091", ROUGE = "#e1000f", IVORY = "#f5f6f2", LINE = "#d6d8cd";

// The sash + fringe, drawn inside a 64×64 box (rotated band, clipped to `clip`).
function sashBand(clip) {
  return `<g clip-path="url(#${clip})">
    <g transform="rotate(-33 32 32)">
      <rect x="-16" y="16" width="96" height="9.5" fill="${BLEU}"/>
      <rect x="-16" y="25.5" width="96" height="9.5" fill="#ffffff"/>
      <rect x="-16" y="35" width="96" height="9.5" fill="${ROUGE}"/>
      <rect x="-16" y="44.2" width="96" height="3" fill="#c9a94a"/>
      <rect x="-16" y="47.2" width="96" height="3" fill="#9c7c26"/>
      <g fill="#9c7c26">
        ${Array.from({ length: 13 }, (_, i) => { const x = -13 + i * 7.4; return `<rect x="${x.toFixed(1)}" y="50.2" width="3.2" height="6.5" rx="1.4"/>`; }).join("")}
      </g>
    </g>
  </g>`;
}

// Favicon / tab mark: rounded card + hairline border, transparent outside.
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><clipPath id="r"><rect width="64" height="64" rx="14"/></clipPath></defs>
  <rect width="64" height="64" rx="14" fill="${IVORY}"/>
  ${sashBand("r")}
  <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="13.25" fill="none" stroke="${LINE}" stroke-width="1.5"/>
</svg>`;

// App icon (opaque, full-bleed ivory so apple-touch / maskable never show through):
// the same card floats centred in a maskable safe zone.
function appIconSvg(size) {
  const inset = Math.round(size * 0.14);         // safe-zone padding for maskable
  const card = size - inset * 2;
  const scale = card / 64;
  const rx = (14 * scale).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
    <defs><clipPath id="c"><rect x="${inset}" y="${inset}" width="${card}" height="${card}" rx="${rx}"/></clipPath></defs>
    <rect width="${size}" height="${size}" fill="${IVORY}"/>
    <g transform="translate(${inset},${inset}) scale(${scale})">
      <rect width="64" height="64" rx="14" fill="#ffffff"/>
    </g>
    <g clip-path="url(#c)"><g transform="translate(${inset},${inset}) scale(${scale})">
      <g transform="rotate(-33 32 32)">
        <rect x="-16" y="16" width="96" height="9.5" fill="${BLEU}"/>
        <rect x="-16" y="25.5" width="96" height="9.5" fill="#ffffff"/>
        <rect x="-16" y="35" width="96" height="9.5" fill="${ROUGE}"/>
        <rect x="-16" y="44.2" width="96" height="3" fill="#c9a94a"/>
        <rect x="-16" y="47.2" width="96" height="3" fill="#9c7c26"/>
        <g fill="#9c7c26">${Array.from({ length: 13 }, (_, i) => { const x = -13 + i * 7.4; return `<rect x="${x.toFixed(1)}" y="50.2" width="3.2" height="6.5" rx="1.4"/>`; }).join("")}</g>
      </g>
    </g></g>
    <g transform="translate(${inset},${inset}) scale(${scale})">
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="13.25" fill="none" stroke="${LINE}" stroke-width="1.5"/>
    </g>
  </svg>`;
}

function png(svg, size) {
  return new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
}

// Inter is the brand face; vendored (gitignored) for on-brand raster rendering.
const INTER = path.join(__dirname, "fonts", "Inter.ttf");
function pngFont(svg, width) {
  return new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { fontFiles: fs.existsSync(INTER) ? [INTER] : [], loadSystemFonts: true, defaultFontFamily: "Inter" },
  }).render().asPng();
}

// Horizontal wordmark lockup: logomark + "FicheDeMaire" + ".fr".
// W×H in a 760×176 box; text at weight 800 to match the site header.
function wordmarkSvg() {
  const mark = `<g transform="translate(24,40) scale(1.5)">
    <defs><clipPath id="wr"><rect width="64" height="64" rx="14"/></clipPath></defs>
    <rect width="64" height="64" rx="14" fill="${IVORY}"/>
    ${sashBand("wr")}
    <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="13.25" fill="none" stroke="${LINE}" stroke-width="1.5"/>
  </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 176">
    ${mark}
    <text x="150" y="118" font-family="Inter, system-ui, sans-serif" font-size="72" font-weight="800" letter-spacing="-2">
      <tspan fill="${BLEU}">Fiche</tspan><tspan fill="#161616">DeMaire</tspan><tspan fill="${ROUGE}">.fr</tspan>
    </text>
  </svg>`;
}

function writeAll() {
  fs.mkdirSync(KIT, { recursive: true });
  // favicon.svg (source of truth)
  fs.writeFileSync(path.join(PUB, "favicon.svg"), faviconSvg + "\n");
  // rasters used by <head> + manifest
  fs.writeFileSync(path.join(PUB, "favicon-32.png"), png(faviconSvg, 32));
  fs.writeFileSync(path.join(PUB, "icon-180.png"), png(appIconSvg(180), 180));
  fs.writeFileSync(path.join(PUB, "icon-512.png"), png(appIconSvg(512), 512));
  // media-kit copies (logomark + wordmark lockup)
  fs.writeFileSync(path.join(KIT, "logomark.svg"), faviconSvg + "\n");
  fs.writeFileSync(path.join(KIT, "logomark-512.png"), png(faviconSvg, 512));
  fs.writeFileSync(path.join(KIT, "logomark-1024.png"), png(faviconSvg, 1024));
  const wm = wordmarkSvg();
  fs.writeFileSync(path.join(KIT, "wordmark.svg"), wm + "\n");
  fs.writeFileSync(path.join(KIT, "wordmark-760.png"), pngFont(wm, 760));
  fs.writeFileSync(path.join(KIT, "wordmark-1520.png"), pngFont(wm, 1520));
  // bundle downloadable zip (best-effort; needs the `zip` binary + screenshots present)
  try {
    const { execSync } = require("child_process");
    const files = ["logomark.svg", "logomark-512.png", "logomark-1024.png", "wordmark.svg", "wordmark-760.png", "wordmark-1520.png", "screen-home.png", "screen-fiche.png", "screen-classements.png"]
      .filter((f) => fs.existsSync(path.join(KIT, f)));
    execSync(`cd ${KIT} && rm -f fichedemaire-media-kit.zip && zip -q fichedemaire-media-kit.zip ${files.join(" ")}`);
    console.log("bundled media kit zip");
  } catch (e) { console.warn("zip skipped:", e.message); }
  console.log("assets written to", PUB, "and", KIT);
}

module.exports = { faviconSvg, appIconSvg, sashBand, writeAll };
if (require.main === module) writeAll();
