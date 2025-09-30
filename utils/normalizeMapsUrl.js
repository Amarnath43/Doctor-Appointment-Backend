// routes/normalizeMapsUrl.js
// Endpoint: POST /utils/normalize-maps-url
// Body: { url: string }
const express= require("express");
const { Client }= require("@googlemaps/google-maps-services-js");

const router = express.Router();
const maps = new Client({});

const dotenv = require('dotenv');               
dotenv.config();

// --- Helpers ---------------------------------------------------------------

function isProbablyGoogleMapsUrl(str) {
  try {
    const u = new URL(str);
    return (
      /(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname.startsWith("/maps")
    ) || /(^|\.)maps\.app\.goo\.gl$/.test(u.hostname);
  } catch {
    return false;
  }
}

function parseFromLongUrl(longUrl) {
  // Try to extract place_id or coordinates from canonical Google Maps URLs
  // Supports:
  // - .../place/?q=place_id:ChIJxxxxxxxx
  // - .../search/?api=1&query_place_id=ChIJxxxxxxxx
  // - .../@12.3456,77.1234,17z
  // - .../search/?api=1&query=12.3456,77.1234
  // - ...?ll=12.3456,77.1234
  try {
    const u = new URL(longUrl);

    // query_place_id
    const qpid = u.searchParams.get("query_place_id");
    if (qpid) return { placeId: qpid };

    // q=place_id:...
    const q = u.searchParams.get("q");
    if (q && q.startsWith("place_id:")) {
      return { placeId: q.replace("place_id:", "") };
    }

    // query=lat,lng
    const query = u.searchParams.get("query");
    if (query) {
      const m = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
    }

    // ll=lat,lng
    const ll = u.searchParams.get("ll");
    if (ll) {
      const m = ll.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
    }
  } catch {
    // ignore URL parse error; we'll try regex next
  }

  // @lat,lng anywhere in the string
  const atMatch = longUrl.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    return { lat: Number(atMatch[1]), lng: Number(atMatch[2]) };
  }

  return {};
}

async function followShortUrl(shortUrl) {
  // Node 18+ fetch follows redirects with redirect:"follow"
  const resp = await fetch(shortUrl, { method: "GET", redirect: "follow" });
  // resp.url is the final URL after redirects (if any)
  return resp.url || shortUrl;
}

function buildResponse({
  placeId = null,
  lat = null,
  lng = null,
  formattedAddress = null,
  addressComponents = [],
  plusCode = null,
  longUrl = null,
}) {
  return {
    placeId,
    lat,
    lng,
    formattedAddress,
    addressComponents,
    plusCode,
    // Optional for debugging/observability
    _debug: { longUrl },
  };
}

// --- Route -----------------------------------------------------------------

router.post("/normalize-maps-url", async (req, res) => {
  try {
    const shortUrl = (req.body?.url || "").trim();
    if (!shortUrl) {
      return res.status(400).json({ error: "Body must include { url }" });
    }

    if (!process.env.GMAPS_KEY) {
      return res.status(500).json({ error: "Server missing GMAPS_KEY" });
    }

    // Basic sanity check (still allow non-google input; we'll try to resolve)
    if (!isProbablyGoogleMapsUrl(shortUrl)) {
      // Not fatal; we can still try to resolve & Find Place from Text
      // console.warn("Input is not a typical Google Maps URL:", shortUrl);
    }

    // 1) Resolve short redirect (maps.app.goo.gl → google.com/maps/…)
    const longUrl = await followShortUrl(shortUrl);

    // 2) Try to parse place_id or lat/lng directly from the resolved URL
    let parsed = parseFromLongUrl(longUrl);

    const apiKey = process.env.GMAPS_KEY;

    // 3) If we have a placeId, use Place Details → canonical info
    if (parsed.placeId) {
      const details = await maps.placeDetails({
        params: {
          place_id: parsed.placeId,
          key: apiKey,
          fields: [
            "place_id",
            "geometry",
            "formatted_address",
            "address_component",
            "plus_code",
          ],
        },
      });

      const r = details.data.result;
      if (!r) {
        return res
          .status(400)
          .json({ error: "Place not found from place_id", _debug: { longUrl } });
      }

      return res.json(
        buildResponse({
          placeId: r.place_id,
          lat: r.geometry.location.lat,
          lng: r.geometry.location.lng,
          formattedAddress: r.formatted_address,
          addressComponents: r.address_components || [],
          plusCode: r.plus_code?.global_code || null,
          longUrl,
        })
      );
    }

    // 4) If we have lat/lng, reverse geocode to get address & (often) place_id
    if (typeof parsed.lat === "number" && typeof parsed.lng === "number") {
      const rev = await maps.reverseGeocode({
        params: { latlng: { lat: parsed.lat, lng: parsed.lng }, key: apiKey },
      });

      const r = rev.data.results?.[0];
      return res.json(
        buildResponse({
          placeId: r?.place_id || null,
          lat: parsed.lat,
          lng: parsed.lng,
          formattedAddress: r?.formatted_address || null,
          addressComponents: r?.address_components || [],
          plusCode: r?.plus_code?.global_code || null,
          longUrl,
        })
      );
    }

    // 5) Fallback: try Find Place from the final URL text itself
    const find = await maps.findPlaceFromText({
      params: {
        input: longUrl,
        inputtype: "textquery",
        key: apiKey,
        fields: ["place_id", "geometry", "formatted_address", "plus_code"],
      },
    });

    const c = find.data.candidates?.[0];
    if (c) {
      // Optionally fetch address_components via Place Details for completeness
      const details = await maps.placeDetails({
        params: {
          place_id: c.place_id,
          key: apiKey,
          fields: ["address_component"],
        },
      });

      return res.json(
        buildResponse({
          placeId: c.place_id,
          lat: c.geometry?.location?.lat ?? null,
          lng: c.geometry?.location?.lng ?? null,
          formattedAddress: c.formatted_address || null,
          addressComponents: details.data.result?.address_components || [],
          plusCode: c.plus_code?.global_code || null,
          longUrl,
        })
      );
    }

    // 6) If nothing worked, return a helpful error
    return res.status(400).json({
      error: "Could not resolve link to a place",
      _debug: { longUrl },
    });
  } catch (err) {
    console.error("normalize-maps-url error:", err);
    return res.status(500).json({ error: "Failed to normalize maps URL" });
  }
});

module.exports = router;
