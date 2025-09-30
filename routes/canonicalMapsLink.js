// routes/canonicalMapsLink.js
const express=require("express");
const { Client }=require("@googlemaps/google-maps-services-js")

const router = express.Router();
const maps = new Client({});

// --- helpers ---
function parseFromLongUrl(longUrl) {
  try {
    const u = new URL(longUrl);
    const qpid = u.searchParams.get("query_place_id");
    if (qpid) return { placeId: qpid };

    const q = u.searchParams.get("q");
    if (q && q.startsWith("place_id:")) return { placeId: q.slice("place_id:".length) };

    const query = u.searchParams.get("query");
    if (query) {
      const m = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
    }

    const ll = u.searchParams.get("ll");
    if (ll) {
      const m = ll.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
    }
  } catch {}
  const at = longUrl.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) };
  return {};
}

function buildCanonical({ placeId, lat, lng }) {
  if (placeId) return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
  if (typeof lat === "number" && typeof lng === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return null;
}

// --- route ---
router.post("/canonical-maps-link", async (req, res) => {
  try {
    const inputUrl = (req.body?.url || "").trim();
    if (!inputUrl) return res.status(400).json({ error: "Body must include { url }" });
    if (!process.env.GMAPS_KEY) return res.status(500).json({ error: "Missing GMAPS_KEY" });

    // Follow short link redirects (Node 18+)
    const resp = await fetch(inputUrl, { redirect: "follow" });
    const longUrl = resp.url || inputUrl;

    // parse from the final URL
    let parsed = parseFromLongUrl(longUrl);

    // If no placeId but we have coordinates, try to turn them into a placeId (nicer link)
    if (!parsed.placeId && typeof parsed.lat === "number" && typeof parsed.lng === "number") {
      try {
        const rev = await maps.reverseGeocode({
          params: { latlng: { lat: parsed.lat, lng: parsed.lng }, key: process.env.GMAPS_KEY },
        });
        const placeId = rev.data.results?.[0]?.place_id || null;
        if (placeId) parsed.placeId = placeId; // upgrade to place_id link if available
      } catch {}
    }

    const canonicalUrl = buildCanonical(parsed) || longUrl; // last resort: final URL
    return res.json({ canonicalUrl });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to build canonical Maps link" });
  }
});

module.exports = router;
