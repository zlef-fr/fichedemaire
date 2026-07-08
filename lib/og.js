// Dynamic social share card (1200×630 SVG) for a commune / mayor fiche.
// Factual, on-brand (civic light theme + écharpe tricolore), screenshot-ready.
function esc(s) {
  return (s || "").toString().replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}
const noEmoji = (s) => (s || "").replace(/[\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{1F300}-\u{1FAFF}‍️]/gu, "").trim();
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("fr-FR"));

// colour a désendettement ratio by CRC reference thresholds (years)
function desendetColor(y) {
  if (y == null) return "#7a7a7a";
  if (y < 0) return "#c9302c";
  if (y <= 8) return "#18753c";
  if (y <= 12) return "#b8860b";
  return "#c9302c";
}

function card(m) {
  const commune = esc(noEmoji(m.commune || ""));
  const dep = esc(noEmoji(`${m.dep} · ${m.depNom || ""}`));
  const mayor = esc(noEmoji(`${m.prenom || ""} ${m.nom || ""}`.trim()));
  const f = m.fin || {};
  const des = f.epargneNegative ? "négative" : (f.desendet != null ? f.desendet + " ans" : "—");
  const desColor = f.epargneNegative ? "#c9302c" : desendetColor(f.desendet);
  const size = commune.length > 22 ? 66 : commune.length > 15 ? 82 : 96;

  const stat = (x, label, value, color) => `
    <g transform="translate(${x},430)">
      <text x="0" y="0" font-size="26" fill="#6b6b6b" font-weight="600">${label}</text>
      <text x="0" y="52" font-size="46" fill="${color || "#161616"}" font-weight="800">${value}</text>
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fbfaf6"/><stop offset="1" stop-color="#eef1ea"/>
  </linearGradient></defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <!-- écharpe tricolore, diagonal sash (top-left → bottom-right) with gilt fringe edge -->
  <g transform="translate(1200,630) rotate(-24)">
    <rect x="-18" y="-900" width="9" height="940" fill="#9c7c26"/>
    <rect x="-9" y="-900" width="9" height="940" fill="#c9a94a"/>
    <rect x="0" y="-900" width="66" height="940" fill="#000091"/>
    <rect x="66" y="-900" width="66" height="940" fill="#ffffff"/>
    <rect x="132" y="-900" width="66" height="940" fill="#e1000f"/>
  </g>
  <g font-family="'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <text x="80" y="118" font-size="30" fill="#000091" font-weight="800" letter-spacing=".5">fichedemaire.fr</text>
    <text x="80" y="${150 + size}" font-size="${size}" fill="#161616" font-weight="800">${commune}</text>
    <text x="80" y="${196 + size}" font-size="30" fill="#565656">${dep}</text>
    <text x="80" y="${240 + size}" font-size="30" fill="#565656">Maire&#160;: <tspan font-weight="700" fill="#161616">${mayor}</tspan></text>
    ${stat(80, "Dette / habitant", fmt(f.dettePerHab) + " €")}
    ${stat(430, "Taux d'épargne brute", f.tauxEpargne != null ? f.tauxEpargne + " %" : "—")}
    ${stat(800, "Désendettement", des, desColor)}
    <text x="80" y="565" font-size="23" fill="#8a8a8a">Comptes ${f.year || ""} · données OFGL (licence Ouverte)</text>
  </g>
</svg>`;
}
module.exports = { card };
