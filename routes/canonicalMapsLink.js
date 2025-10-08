const express = require("express");
const { Client } = require("@googlemaps/google-maps-services-js");

const router = express.Router();
const maps = new Client({});

// tiny helpers
const toNumberPair = (s) => {
  const m = String(s || "").match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
};

function parseFromLongUrl(longUrl) {
  try {
    const u = new URL(longUrl);

    // 1) Direct place-id params
    const qpid = u.searchParams.get("query_place_id");
    if (qpid) return { placeId: qpid };

    const q = u.searchParams.get("q");
    if (q && q.startsWith("place_id:")) return { placeId: q.slice("place_id:".length) };

    // 2) Directions / search coords we can use for bias only (NOT final)
    const query = u.searchParams.get("query");
    const qLL = toNumberPair(query);
    if (qLL) return { biasLL: qLL };

    const ll = toNumberPair(u.searchParams.get("ll"));
    if (ll) return { biasLL: ll };

    const dest = u.searchParams.get("destination");
    if (dest) {
      if (dest.startsWith("place_id:")) return { placeId: dest.slice("place_id:".length) };
      const dLL = toNumberPair(dest);
      if (dLL) return { biasLL: dLL };
    }

    // Path @lat,lng is often **viewport center**, not the pin → only use as bias
    const at = longUrl.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (at) return { biasLL: { lat: Number(at[1]), lng: Number(at[2]) } };

    // Fallback: if q has free text, keep it for a text search
    if (q && !q.startsWith("place_id:")) return { freeText: q };
  } catch {}

  return {};
}

function buildPlaceUrl(placeId) {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
}
function buildRouteUrl(placeId) {
  return `https://www.google.com/maps/dir/?api=1&destination=place_id:${encodeURIComponent(placeId)}`;
}

router.post("/canonical-maps-link", async (req, res) => {
  try {
    const inputUrl = (req.body?.url || "").trim();
    const businessName = (req.body?.name || "").trim();          // if you have it
    const businessPhone = (req.body?.phone || "").trim();        // if you have it (international format preferred)
    const regionCode = (req.body?.regionCode || "IN").trim();    // helps ranking in India

    if (!inputUrl) return res.status(400).json({ error: "Body must include { url }" });
    if (!process.env.GMAPS_KEY) return res.status(500).json({ error: "Missing GMAPS_KEY" });

    // Resolve shortlink with desktop UA
    const resp = await fetch(inputUrl, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.8",
      },
    });
    const longUrl = resp.url || inputUrl;

    // Try to parse a real placeId from final URL
    let parsed = parseFromLongUrl(longUrl);
    let placeId = parsed.placeId || null;

    // If we didn't get a placeId, use Places API to find it WITHOUT snapping coords.
    if (!placeId) {
      // 1) Prefer phone lookup (strongest signal)
      if (businessPhone) {
        const fp = await maps.findPlaceFromText({
          params: {
            key: process.env.GMAPS_KEY,
            input: businessPhone,
            inputtype: "phonenumber",
            fields: ["place_id","geometry","name","formatted_address"],
            region: regionCode,
          },
        });
        placeId = fp.data.candidates?.[0]?.place_id || placeId;
      }

      // 2) Otherwise, use name+free text, with location bias if we got any coords from the URL
      if (!placeId && (businessName || parsed.freeText)) {
        const text = businessName
          ? `${businessName} ${parsed.freeText || ""}`.trim()
          : parsed.freeText;

        const params = {
          key: process.env.GMAPS_KEY,
          input: text,
          inputtype: "textquery",
          fields: ["place_id","geometry","name","formatted_address"],
          region: regionCode,
        };
        if (parsed.biasLL) {
          // 2km bias circle to help disambiguate
          params.locationbias = `circle:2000@${parsed.biasLL.lat},${parsed.biasLL.lng}`;
        }

        const fp2 = await maps.findPlaceFromText({ params });
        placeId = fp2.data.candidates?.[0]?.place_id || placeId;
      }
    }

    if (!placeId) {
      // As a last resort, return a coordinate canonical only if we *explicitly* got coordinates as bias.
      // But warn the client that this might be off if it came from viewport center.
      if (parsed.biasLL) {
        const coordUrl = `https://www.google.com/maps?q=${parsed.biasLL.lat},${parsed.biasLL.lng}`;
        return res.json({
          canonicalUrl: coordUrl,
          routeUrl: `https://www.google.com/maps/dir/?api=1&destination=${parsed.biasLL.lat},${parsed.biasLL.lng}`,
          warning: "Used viewport/bias coordinates. Provide phone or business name to lock onto exact place pin.",
          debug: { inputUrl, longUrl, parsed }
        });
      }
      return res.status(404).json({ error: "Could not determine place_id. Provide business name or phone." });
    }

    // Optional: confirm details (and get the official Google Maps URL if you want to store it)
    const details = await maps.placeDetails({
      params: { key: process.env.GMAPS_KEY, place_id: placeId, fields: ["url","geometry","name","adr_address"] },
    });
    const officialUrl = details.data.result?.url || buildPlaceUrl(placeId);

    return res.json({
      placeId,
      canonicalUrl: buildPlaceUrl(placeId),
      officialGoogleMapsUrl: officialUrl, // Google’s own canonical link
      routeUrl: buildRouteUrl(placeId),   // exact routing to the business pin
      debug: { inputUrl, longUrl, parsed }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to resolve exact place_id / route" });
  }
});

module.exports = router;
