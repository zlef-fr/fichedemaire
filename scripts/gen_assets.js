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
    <g transform="rotate(33 32 32)">
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
      <g transform="rotate(33 32 32)">
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

// Diagonal écharpe corner sash (top-left → bottom-right) + gilt edge, for the
// landscape OG card. Mirrors lib/og.js so both slant the same way as the logo.
function ogSash() {
  return `<g transform="translate(1200,630) rotate(-24)">
    <rect x="-18" y="-900" width="9" height="940" fill="#9c7c26"/>
    <rect x="-9" y="-900" width="9" height="940" fill="#c9a94a"/>
    <rect x="0" y="-900" width="66" height="940" fill="${BLEU}"/>
    <rect x="66" y="-900" width="66" height="940" fill="#ffffff"/>
    <rect x="132" y="-900" width="66" height="940" fill="${ROUGE}"/>
  </g>`;
}

// Default site OG share card (1200×630), rendered with Inter.
function defaultOgSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fbfaf6"/><stop offset="1" stop-color="#eef1ea"/>
    </linearGradient></defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    ${ogSash()}
    <g font-family="Inter, system-ui, sans-serif">
      <text x="80" y="120" font-size="30" font-weight="800" fill="${BLEU}" letter-spacing="0.5">fichedemaire.fr</text>
      <text x="78" y="270" font-size="78" font-weight="800" fill="#161616" letter-spacing="-2">Votre commune,</text>
      <text x="78" y="360" font-size="78" font-weight="800" letter-spacing="-2"><tspan fill="#161616">votre maire, </tspan><tspan fill="${BLEU}">en chiffres.</tspan></text>
      <text x="80" y="452" font-size="29" fill="#565656">34 637 communes · identité du maire, finances, HATVP — 100 % sourcé.</text>
      <text x="80" y="560" font-size="24" fill="#8a8a8a">RNE · OFGL · HATVP — données publiques en licence Ouverte</text>
    </g>
  </svg>`;
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
  // default site OG share card (Inter, sash matches the logo)
  fs.writeFileSync(path.join(PUB, "og.png"), pngFont(defaultOgSvg(), 1200));
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
