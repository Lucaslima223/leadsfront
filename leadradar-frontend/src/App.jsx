import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — preencha as credenciais aqui antes de usar
// ─────────────────────────────────────────────────────────────────────────────
const GOOGLE_MAPS_API_KEY = "SUA_GOOGLE_MAPS_API_KEY_AQUI"; // ← substitua pela sua chave
const BACKEND_URL         = "https://SEU-BACKEND.railway.app"; // ← substitua pela URL do backend após deploy

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const PORTES = ["Micro", "Pequeno", "Médio", "Grande"];
const PORTE_COLORS = {
  Micro:   { bg: "rgba(254,243,199,0.08)", text: "#FCD34D", border: "rgba(252,211,77,0.2)" },
  Pequeno: { bg: "rgba(209,250,229,0.08)", text: "#34D399", border: "rgba(52,211,153,0.2)" },
  Médio:   { bg: "rgba(219,234,254,0.08)", text: "#60A5FA", border: "rgba(96,165,250,0.2)" },
  Grande:  { bg: "rgba(237,233,254,0.08)", text: "#A78BFA", border: "rgba(167,139,250,0.2)" },
};

function formatCNPJ(v = "") {
  const c = v.replace(/\D/g, "").padStart(14, "0");
  return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12,14)}`;
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.places) return resolve(window.google.maps);
    const existing = document.getElementById("gmap-sdk");
    if (existing) { existing.addEventListener("load", () => resolve(window.google.maps)); return; }
    const s = document.createElement("script");
    s.id = "gmap-sdk";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=pt-BR`;
    s.async = true;
    s.onload = () => resolve(window.google.maps);
    s.onerror = () => reject(new Error("Falha ao carregar Google Maps SDK"));
    document.head.appendChild(s);
  });
}

async function geocodeAddress(maps, address) {
  return new Promise((resolve, reject) => {
    new maps.Geocoder().geocode({ address, region: "BR" }, (results, status) => {
      if (status === "OK" && results[0]) {
        const l = results[0].geometry.location;
        resolve({ lat: l.lat(), lng: l.lng() });
      } else reject(new Error(`Endereço não encontrado (${status})`));
    });
  });
}

async function searchNearbyPlaces(maps, lat, lng, radiusM) {
  return new Promise((resolve) => {
    const svc = new maps.places.PlacesService(document.createElement("div"));
    svc.nearbySearch({ location: new maps.LatLng(lat, lng), radius: radiusM, type: "establishment" },
      (results, status) => resolve(status === maps.places.PlacesServiceStatus.OK ? results || [] : []));
  });
}

async function getPlaceDetails(maps, placeId) {
  return new Promise((resolve) => {
    const svc = new maps.places.PlacesService(document.createElement("div"));
    svc.getDetails(
      { placeId, fields: ["name","formatted_phone_number","website","formatted_address","geometry","business_status","types"] },
      (r, s) => resolve(s === maps.places.PlacesServiceStatus.OK ? r : null)
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND API CALLS
// ─────────────────────────────────────────────────────────────────────────────
async function enrichWithBackend(companies) {
  const res = await fetch(`${BACKEND_URL}/api/enrich`, { // usa constante do topo do arquivo
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companies }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`Backend error ${res.status}`);
  const data = await res.json();
  return data.enriched || [];
}

// ─────────────────────────────────────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────────────────────────────────────
const Ic = ({ d, size = 18, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const I = {
  search:   "M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z",
  location: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z",
  radius:   "M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 4a6 6 0 1 1 0 12A6 6 0 0 1 12 6zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  phone:    "M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.37 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.128.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.572 2.81.7A2 2 0 0 1 22 16.92z",
  email:    "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm16 2l-8 5-8-5",
  filter:   "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  building: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  map:      "M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z M8 2v16M16 6v16",
  close:    "M18 6L6 18M6 6l12 12",
  check:    "M20 6L9 17l-5-5",
  contact:  "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  alert:    "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4M12 17h.01",
  globe:    "M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",

  back:     "M19 12H5M12 19l-7-7 7-7",
  person:   "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  calendar: "M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4zM16 2v4M8 2v4M3 10h18",
  money:    "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  instagram:"M16 3H8a5 5 0 0 0-5 5v8a5 5 0 0 0 5 5h8a5 5 0 0 0 5-5V8a5 5 0 0 0-5-5zm-4 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm4.5-9a1 1 0 1 1 0 2 1 1 0 0 1 0-2z",
  facebook: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z",
  linkedin: "M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z M4 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  whatsapp: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z",
};

// ─────────────────────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Outfit:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#060C18;--s1:#0D1526;--s2:#131E32;--s3:#1A2640;
  --b1:#1E2D45;--b2:#243450;
  --a1:#00E5FF;--a2:#6C63FF;--a3:#FF6B6B;
  --t1:#EEF3FF;--t2:#8899CC;--t3:#4A5A80;--t4:#2A3A5A;
  --ok:#22D3A5;--warn:#F59E0B;--err:#F87171;
  --r:12px;--rl:20px;
}
body{background:var(--bg);color:var(--t1);font-family:'Outfit',sans-serif;min-height:100vh;}
.app{min-height:100vh;position:relative;overflow:hidden;}
.noise{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0.022;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size:200px;}
.grid-bg{position:fixed;inset:0;z-index:0;pointer-events:none;
  background-image:linear-gradient(rgba(0,229,255,0.022) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.022) 1px,transparent 1px);
  background-size:48px 48px;}
.glow{position:fixed;z-index:0;pointer-events:none;border-radius:50%;filter:blur(140px);}
.g1{width:700px;height:700px;background:var(--a1);top:-300px;left:-250px;opacity:0.07;}
.g2{width:600px;height:600px;background:var(--a2);bottom:-250px;right:-200px;opacity:0.07;}
.pg{position:relative;z-index:1;}

/* TOPBAR */
.topbar{padding:18px 40px;border-bottom:1px solid var(--b1);display:flex;align-items:center;gap:14px;
  background:rgba(6,12,24,0.75);backdrop-filter:blur(14px);position:sticky;top:0;z-index:10;}
.logo{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,var(--a1),var(--a2));
  display:flex;align-items:center;justify-content:center;box-shadow:0 0 18px rgba(0,229,255,0.35);}
.tb-title{font-family:'Syne',sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.5px;}
.tb-sub{font-size:11px;color:var(--t3);margin-top:1px;}
.tb-pill{margin-left:auto;padding:4px 13px;border-radius:20px;font-size:11px;font-weight:600;
  background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.18);color:var(--a1);}

/* BACKEND BANNER */


/* SEARCH LAYOUT */
.sw{display:grid;grid-template-columns:1fr 1fr;gap:32px;padding:28px 40px;max-width:1080px;margin:0 auto;align-items:start;}
.sl{position:sticky;top:80px;}
.hero{font-family:'Syne',sans-serif;font-size:44px;font-weight:800;line-height:1.05;letter-spacing:-2px;margin-bottom:14px;
  background:linear-gradient(135deg,#EEF3FF 40%,var(--a1));-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
.tagline{font-size:14px;color:var(--t2);line-height:1.75;margin-bottom:28px;}
.chips{display:flex;flex-wrap:wrap;gap:7px;}
.chip{padding:5px 13px;border-radius:20px;font-size:11px;font-weight:500;background:var(--s2);border:1px solid var(--b1);color:var(--t2);display:flex;align-items:center;gap:5px;}
.cdot{width:5px;height:5px;border-radius:50%;background:var(--ok);}
.cdot.off{background:var(--t4);}

/* FORM */
.fc{background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);padding:26px;box-shadow:0 24px 64px rgba(0,0,0,0.5);}
.fs{margin-bottom:20px;}
.fl{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;}
.req{color:var(--a1);}
.iw{position:relative;}
.ii{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--t4);pointer-events:none;}
.ir{position:absolute;right:10px;top:50%;transform:translateY(-50%);}
input[type=text],input[type=number],input[type=password]{
  width:100%;padding:12px 12px 12px 40px;background:var(--s2);border:1px solid var(--b1);
  border-radius:var(--r);color:var(--t1);font-family:'Outfit',sans-serif;font-size:14px;outline:none;transition:border-color 0.2s,box-shadow 0.2s;-webkit-appearance:none;}
input:focus{border-color:var(--a1);box-shadow:0 0 0 3px rgba(0,229,255,0.07);}
input::placeholder{color:var(--t4);}
input[type=password]{padding-right:40px;}

.rrow{display:flex;align-items:center;gap:11px;}
.slider{flex:1;-webkit-appearance:none;height:4px;background:var(--b2);border-radius:4px;outline:none;cursor:pointer;}
.slider::-webkit-slider-thumb{-webkit-appearance:none;width:17px;height:17px;border-radius:50%;background:var(--a1);cursor:pointer;box-shadow:0 0 10px rgba(0,229,255,0.55);}
.rv{min-width:55px;padding:7px 10px;text-align:center;background:var(--s2);border:1px solid var(--b1);border-radius:8px;font-size:13px;font-weight:700;color:var(--a1);}
.pg-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}
.pb{padding:9px 5px;border-radius:9px;border:1px solid var(--b1);background:var(--s2);color:var(--t3);font-family:'Outfit',sans-serif;font-size:11px;font-weight:500;cursor:pointer;transition:all 0.18s;text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px;}
.pb.on{background:rgba(0,229,255,0.07);border-color:rgba(0,229,255,0.35);color:var(--a1);}
.pd{width:6px;height:6px;border-radius:50%;}
hr.dv{border:none;border-top:1px solid var(--b1);margin:18px 0;}
.btn-go{width:100%;padding:14px;border-radius:var(--r);background:linear-gradient(135deg,var(--a1),#0099BB);border:none;color:#030810;font-family:'Syne',sans-serif;font-size:15px;font-weight:800;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 8px 30px rgba(0,229,255,0.28);}
.btn-go:hover{transform:translateY(-2px);box-shadow:0 14px 42px rgba(0,229,255,0.38);}
.btn-go:disabled{opacity:0.38;cursor:not-allowed;transform:none;box-shadow:none;}
.err-box{background:rgba(248,113,113,0.07);border:1px solid rgba(248,113,113,0.25);border-radius:9px;padding:11px 14px;margin-bottom:14px;font-size:12px;color:var(--err);display:flex;gap:8px;align-items:flex-start;}

/* LOADING */
.lp{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:calc(100vh - 74px);gap:26px;animation:fadeUp 0.4s ease;}
.ro{position:relative;width:148px;height:148px;}
.rr{position:absolute;border-radius:50%;border:1px solid rgba(0,229,255,0.1);animation:rp 2.4s ease-in-out infinite;}
.rr:nth-child(1){inset:0;}.rr:nth-child(2){inset:22px;animation-delay:.5s;}.rr:nth-child(3){inset:44px;animation-delay:1s;}
.rc{position:absolute;inset:58px;border-radius:50%;background:linear-gradient(135deg,var(--a1),var(--a2));display:flex;align-items:center;justify-content:center;animation:pulse 1.6s ease-in-out infinite;box-shadow:0 0 26px rgba(0,229,255,0.5);}
.rsw{position:absolute;inset:0;border-radius:50%;overflow:hidden;animation:sweep 2.4s linear infinite;}
.rsw::after{content:'';position:absolute;top:50%;left:50%;width:50%;height:2px;background:linear-gradient(90deg,transparent,var(--a1));transform-origin:left center;}
.lt{font-family:'Syne',sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.8px;text-align:center;}
.ls{font-size:12px;color:var(--t2);text-align:center;}
.stl{display:flex;flex-direction:column;gap:7px;min-width:280px;}
.st{display:flex;align-items:center;gap:11px;padding:10px 14px;border-radius:9px;background:var(--s1);border:1px solid var(--b1);font-size:12px;color:var(--t3);transition:all 0.35s;}
.st.done{border-color:rgba(34,211,165,0.28);color:var(--ok);}
.st.act{border-color:rgba(0,229,255,0.28);color:var(--a1);}
.sdot{width:7px;height:7px;border-radius:50%;background:var(--t4);}
.sdot.a{background:var(--a1);animation:pulse 1s infinite;}
.lp-note{font-size:11px;color:var(--t3);display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;background:var(--s1);border:1px solid var(--b1);}

/* RESULTS */
.rp{padding:26px 40px;animation:fadeUp 0.45s ease;}
.rb{display:flex;align-items:center;gap:12px;margin-bottom:22px;flex-wrap:wrap;}
.bbk{padding:7px 15px;border-radius:8px;background:var(--s1);border:1px solid var(--b1);color:var(--t2);cursor:pointer;font-family:'Outfit',sans-serif;font-size:12px;transition:all 0.2s;display:flex;align-items:center;gap:6px;}
.bbk:hover{border-color:var(--a1);color:var(--a1);}
.rh{font-family:'Syne',sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.8px;}
.bc{margin-left:auto;padding:6px 16px;border-radius:20px;background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.2);font-size:12px;font-weight:700;color:var(--a1);}
.ftags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:24px;}
.ft{padding:4px 12px;border-radius:20px;background:var(--s2);border:1px solid var(--b1);font-size:11px;color:var(--t2);display:flex;align-items:center;gap:4px;}
.ft b{color:var(--t1);}
.rgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:13px;}
.card{background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);padding:20px;transition:all 0.22s;animation:cardIn 0.5s ease both;}
.card:hover{border-color:rgba(0,229,255,0.26);transform:translateY(-2px);box-shadow:0 16px 46px rgba(0,0,0,0.35);}
.ch{display:flex;align-items:flex-start;justify-content:space-between;gap:9px;margin-bottom:14px;}
.cico{width:40px;height:40px;border-radius:10px;flex-shrink:0;background:linear-gradient(135deg,rgba(0,229,255,0.1),rgba(108,99,255,0.1));border:1px solid rgba(0,229,255,0.14);display:flex;align-items:center;justify-content:center;color:var(--a1);}
.cn{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;line-height:1.3;margin-bottom:2px;}
.ca{font-size:11px;color:var(--t2);}
.ptag{padding:3px 8px;border-radius:5px;font-size:10px;font-weight:700;white-space:nowrap;}
.cm{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;}
.ml{font-size:9px;color:var(--t4);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;}
.mv{font-size:11px;color:var(--t2);font-weight:500;}
.mv.cn2{font-family:monospace;font-size:10px;}
.mv.dist{color:var(--a1);font-weight:700;}
.mv.ok{color:var(--ok);font-weight:700;}
.mv.err{color:var(--err);font-weight:700;}
.conf-bar{height:3px;border-radius:2px;background:var(--b2);margin-top:4px;overflow:hidden;}
.conf-fill{height:100%;border-radius:2px;background:linear-gradient(90deg,var(--a1),var(--a2));}
.bct{width:100%;padding:10px;border-radius:8px;background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.18);color:var(--a1);font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.18s;display:flex;align-items:center;justify-content:center;gap:6px;}
.bct:hover{background:rgba(0,229,255,0.12);}
.enriching{opacity:0.6;pointer-events:none;}

/* MODAL */
.ov{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.78);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn 0.2s ease;}
.modal{background:var(--s1);border:1px solid var(--b2);border-radius:var(--rl);padding:26px;width:100%;max-width:420px;box-shadow:0 32px 80px rgba(0,0,0,0.7);animation:modalIn 0.22s ease;max-height:90vh;overflow-y:auto;}
.mhd{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:22px;}
.mn{font-family:'Syne',sans-serif;font-size:17px;font-weight:700;line-height:1.25;}
.ms{font-size:11px;color:var(--t2);margin-top:2px;}
.xb{width:32px;height:32px;border-radius:7px;border:1px solid var(--b1);background:var(--s2);cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--t2);transition:all 0.18s;flex-shrink:0;}
.xb:hover{border-color:var(--a1);color:var(--a1);}
.cs{margin-bottom:18px;}
.cst{font-size:9px;color:var(--t4);text-transform:uppercase;letter-spacing:1px;margin-bottom:7px;font-weight:700;}
.ci{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;background:var(--s2);border:1px solid var(--b1);margin-bottom:6px;font-size:12px;color:var(--t2);transition:all 0.15s;}
.ci:hover{border-color:rgba(0,229,255,0.28);color:var(--t1);}
.cio{color:var(--a1);flex-shrink:0;}
.sgrid{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
.si{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:8px;background:var(--s2);border:1px solid var(--b1);font-size:11px;color:var(--t2);transition:all 0.15s;}
.si:hover{border-color:rgba(108,99,255,0.35);color:var(--t1);}
.sn{font-size:9px;color:var(--t4);margin-bottom:1px;}
.socios-list{display:flex;flex-direction:column;gap:6px;}
.socio{display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:8px;background:var(--s2);border:1px solid var(--b1);font-size:11px;}
.snome{font-weight:600;color:var(--t1);}
.squal{color:var(--t3);font-size:10px;}
.ct-empty{font-size:11px;color:var(--t4);font-style:italic;padding:4px 0;}
.src-note{font-size:10px;color:var(--t4);margin-top:14px;padding-top:12px;border-top:1px solid var(--b1);display:flex;align-items:center;gap:5px;flex-wrap:wrap;}
.conf-badge{padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;}

/* EMPTY */
.empty{text-align:center;padding:60px 24px;color:var(--t2);}
.empty-ico{font-size:48px;margin-bottom:14px;}
.empty-t{font-family:'Syne',sans-serif;font-size:20px;font-weight:700;margin-bottom:7px;color:var(--t1);}

/* ANIMS */
@keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
@keyframes modalIn{from{opacity:0;transform:scale(0.94) translateY(10px);}to{opacity:1;transform:scale(1) translateY(0);}}
@keyframes cardIn{from{opacity:0;transform:translateY(13px);}to{opacity:1;transform:translateY(0);}}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.45;}}
@keyframes rp{0%,100%{border-color:rgba(0,229,255,0.1);}50%{border-color:rgba(0,229,255,0.3);}}
@keyframes sweep{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}

@media(max-width:680px){
  .topbar{padding:14px 16px;}.sw{grid-template-columns:1fr;padding:16px;gap:20px;}.sl{position:static;}
  .hero{font-size:34px;}.rp{padding:18px 14px;}.rgrid{grid-template-columns:1fr;}
  .pg-grid{grid-template-columns:repeat(2,1fr);}.sgrid{grid-template-columns:1fr;}
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// LOADING STEPS
// ─────────────────────────────────────────────────────────────────────────────
const STEPS = [
  "Geolocalização do endereço (Google Geocoding)",
  "Buscando estabelecimentos próximos (Google Places)",
  "Coletando detalhes de cada empresa",
  "Enriquecendo com CNPJ via Receita Federal",
  "Aplicando filtros e ordenando por distância",
];

function Loader({ step }) {
  return (
    <div className="lp">
      <div className="ro">
        <div className="rr"/><div className="rr"/><div className="rr"/>
        <div className="rc"><Ic d={I.search} size={17} color="#030810"/></div>
        <div className="rsw"/>
      </div>
      <div><div className="lt">Buscando leads reais…</div><div className="ls">Google Places + Receita Federal via backend</div></div>
      <div className="stl">
        {STEPS.map((s, i) => {
          const done = i < step, act = i === step;
          return (
            <div key={i} className={`st${done?" done":act?" act":""}`}>
              <div style={{width:18,display:"flex",justifyContent:"center",flexShrink:0}}>
                {done ? <Ic d={I.check} size={14} color="var(--ok)"/> : act ? <div className="sdot a"/> : <div className="sdot"/>}
              </div>
              {s}
            </div>
          );
        })}
      </div>
      <div className="lp-note"><Ic d={I.globe} size={12} color="var(--t3)"/>Backend consultando 4 fontes em paralelo</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT MODAL
// ─────────────────────────────────────────────────────────────────────────────
function ContactModal({ company, onClose }) {
  useEffect(() => {
    const h = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const { contatos = {} } = company;
  const phones = [...new Set([...(contatos.telefones || []), ...(company.telefones || [])])];
  const emails = [...new Set([...(contatos.emails || []), ...(company.emails || [])])];
  const socials = Object.entries(contatos.redesSociais || {});
  const socios = company.socios || [];
  const SI = { instagram: I.instagram, facebook: I.facebook, linkedin: I.linkedin, whatsapp: I.whatsapp };
  const SL = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", whatsapp: "WhatsApp" };

  const confColor = company.confidence >= 80 ? "var(--ok)" : company.confidence >= 50 ? "var(--warn)" : "var(--err)";

  return (
    <div className="ov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="mhd">
          <div>
            <div className="mn">{company.nomeFantasia}</div>
            <div className="ms">{company.atividadeEconomica} · {company.porte}</div>
          </div>
          <button className="xb" onClick={onClose}><Ic d={I.close} size={14}/></button>
        </div>

        {phones.length > 0 && (
          <div className="cs">
            <div className="cst">Telefones</div>
            {phones.map((t, i) => (
              <div key={i} className="ci">
                <span className="cio"><Ic d={I.phone} size={14}/></span>
                <a href={`tel:${t.replace(/\D/g,"")}`} style={{color:"inherit",textDecoration:"none"}}>{t}</a>
              </div>
            ))}
          </div>
        )}

        {emails.length > 0 && (
          <div className="cs">
            <div className="cst">E-mails</div>
            {emails.map((e, i) => (
              <div key={i} className="ci">
                <span className="cio"><Ic d={I.email} size={14}/></span>
                <a href={`mailto:${e}`} style={{color:"inherit",textDecoration:"none"}}>{e}</a>
              </div>
            ))}
          </div>
        )}

        {socials.length > 0 && (
          <div className="cs">
            <div className="cst">Redes Sociais</div>
            <div className="sgrid">
              {socials.map(([rede, handle]) => (
                <div key={rede} className="si">
                  <span style={{color:"var(--a2)"}}><Ic d={SI[rede]||I.globe} size={14}/></span>
                  <div><div className="sn">{SL[rede]||rede}</div><div>{handle}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {socios.length > 0 && (
          <div className="cs">
            <div className="cst">Sócios</div>
            <div className="socios-list">
              {socios.map((s, i) => (
                <div key={i} className="socio">
                  <Ic d={I.person} size={14} color="var(--a2)"/>
                  <div>
                    <div className="snome">{s.nome}</div>
                    <div className="squal">{s.qualificacao}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {company.dataAbertura && (
          <div className="cs">
            <div className="cst">Dados Cadastrais</div>
            <div className="ci"><span className="cio"><Ic d={I.calendar} size={14}/></span>Abertura: {company.dataAbertura}</div>
            {company.capitalSocial && <div className="ci"><span className="cio"><Ic d={I.money} size={14}/></span>Capital Social: R$ {Number(company.capitalSocial).toLocaleString("pt-BR")}</div>}
            {company.naturezaJuridica && <div className="ci"><span className="cio"><Ic d={I.building} size={14}/></span>{company.naturezaJuridica}</div>}
          </div>
        )}

        {phones.length === 0 && emails.length === 0 && socials.length === 0 && socios.length === 0 && (
          <div className="ct-empty">Nenhum contato disponível. Tente buscar o CNPJ diretamente na Receita Federal.</div>
        )}

        <div className="src-note">
          <Ic d={I.globe} size={11}/>
          Fontes: Google Places + BrasilAPI (Receita Federal)
          {company.confidence > 0 && (
            <span className="conf-badge" style={{background:confColor+"22",color:confColor}}>
              {company.confidence}% confiança
            </span>
          )}
          {company.source && <span style={{color:"var(--t4)"}}> · {company.source}</span>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY CARD
// ─────────────────────────────────────────────────────────────────────────────
function CompanyCard({ company, index, onContact }) {
  const pc = PORTE_COLORS[company.porte] || PORTE_COLORS.Médio;
  const isEnriched = !!company.cnpj && company.cnpj !== "Consultando…";
  const isActive = company.ativa;

  return (
    <div className="card" style={{animationDelay:`${index*0.05}s`}}>
      <div className="ch">
        <div style={{display:"flex",gap:10,alignItems:"flex-start",flex:1,minWidth:0}}>
          <div className="cico"><Ic d={I.building} size={18}/></div>
          <div style={{minWidth:0}}>
            <div className="cn" title={company.nomeFantasia}>{company.nomeFantasia}</div>
            <div className="ca">{company.atividadeEconomica}</div>
          </div>
        </div>
        <span className="ptag" style={{background:pc.bg,color:pc.text,border:`1px solid ${pc.border}`}}>{company.porte}</span>
      </div>

      <div className="cm">
        <div>
          <div className="ml">CNPJ</div>
          <div className={`mv cn2${!isEnriched?" enriching":""}`} style={{color:isEnriched?"var(--t2)":"var(--t4)"}}>
            {company.cnpj || "—"}
          </div>
        </div>
        <div>
          <div className="ml">Distância</div>
          <div className="mv dist">{company.distancia?.toFixed(1)} km</div>
        </div>
        <div>
          <div className="ml">Situação</div>
          <div className={`mv${isActive?" ok":" err"}`}>{company.situacao || "—"}</div>
        </div>
        <div>
          <div className="ml">Confiança CNPJ</div>
          <div>
            <div style={{fontSize:10,color:company.confidence>0?"var(--t2)":"var(--t4)"}}>
              {company.confidence > 0 ? `${company.confidence}%` : "N/A"}
            </div>
            {company.confidence > 0 && (
              <div className="conf-bar"><div className="conf-fill" style={{width:`${company.confidence}%`}}/></div>
            )}
          </div>
        </div>
      </div>

      <button className="bct" onClick={() => onContact(company)}>
        <Ic d={I.contact} size={14}/>Ver Contatos
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("search");
  const [address, setAddress] = useState("");
  const [radius, setRadius] = useState(3);
  const [selectedPortes, setSelectedPortes] = useState([]);
  const [results, setResults] = useState([]);
  const [contactCompany, setContactCompany] = useState(null);
  const [searchMeta, setSearchMeta] = useState({});
  const [loadStep, setLoadStep] = useState(0);
  const [searchError, setSearchError] = useState("");

  const togglePorte = p => setSelectedPortes(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const handleSearch = async () => {
    setSearchError("");
    if (!address.trim()) return;

    setPage("loading");
    setLoadStep(0);

    try {
      // Step 0 — Geocode
      const maps = await loadGoogleMaps(GOOGLE_MAPS_API_KEY);
      let coords;
      try { coords = await geocodeAddress(maps, address); }
      catch (e) { throw new Error(`Endereço não encontrado: ${e.message}`); }
      setLoadStep(1);

      // Step 1 — Nearby search
      const places = await searchNearbyPlaces(maps, coords.lat, coords.lng, Math.min(radius * 1000, 10000));
      setLoadStep(2);

      // Step 2 — Get details (max 20)
      const toProcess = places.slice(0, 20);
      const details = await Promise.all(toProcess.map(p => getPlaceDetails(maps, p.place_id)));
      setLoadStep(3);

      // Build base companies from Places data
      const baseCompanies = [];
      for (let i = 0; i < toProcess.length; i++) {
        const place = toProcess[i], detail = details[i];
        if (!detail) continue;
        const loc = detail.geometry?.location;
        const dist = loc ? haversine(coords.lat, coords.lng, loc.lat(), loc.lng()) : 999;
        if (dist > radius) continue;

        const types = place.types || [];
        let porte = "Pequeno";
        if (types.some(t => ["supermarket","shopping_mall","hospital"].includes(t))) porte = "Grande";
        else if ((place.user_ratings_total||0) > 500) porte = "Médio";
        else if ((place.user_ratings_total||0) < 20) porte = "Micro";

        const actLabel = types.filter(t => !["point_of_interest","establishment","food"].includes(t))[0]
          ?.replace(/_/g," ") || "";

        // Extract social from website
        const redesSociais = {};
        if (detail.website) {
          const u = detail.website.toLowerCase();
          if (u.includes("instagram.com")) { const m = u.match(/instagram\.com\/([^/?#]+)/); if (m) redesSociais.instagram = `@${m[1]}`; }
          if (u.includes("facebook.com"))  { const m = u.match(/facebook\.com\/([^/?#]+)/);  if (m) redesSociais.facebook = m[1]; }
          if (u.includes("linkedin.com"))  redesSociais.linkedin = detail.website;
        }

        baseCompanies.push({
          id: place.place_id,
          nomeFantasia: detail.name || place.name,
          cnpj: "Consultando…",
          cnpjFormatado: null,
          porte,
          atividadeEconomica: actLabel || detail.name,
          distancia: dist,
          municipio: detail.formatted_address?.split(",").slice(-3,-1).join(",").trim() || "",
          ativa: detail.business_status === "OPERATIONAL",
          situacao: detail.business_status === "OPERATIONAL" ? "Ativa" : (detail.business_status || "—"),
          confidence: 0,
          socios: [],
          emails: [],
          telefones: detail.formatted_phone_number ? [detail.formatted_phone_number] : [],
          contatos: {
            telefones: detail.formatted_phone_number ? [detail.formatted_phone_number] : [],
            emails: [],
            redesSociais,
          },
        });
      }

      // Step 3 — Enrich with CNPJ via backend
      let enriched = baseCompanies;
      if (!BACKEND_URL.includes("SEU-BACKEND")) {
        try {
          const payload = baseCompanies.map(c => ({ name: c.nomeFantasia, municipio: c.municipio }));
          const enrichedData = await enrichWithBackend(payload);
          enriched = baseCompanies.map((c, i) => {
            const e = enrichedData[i] || {};
            return {
              ...c,
              cnpj: e.cnpjFormatado || e.cnpj || "Não encontrado",
              porte: e.porte || c.porte,
              situacao: e.situacao || c.situacao,
              ativa: e.ativa ?? c.ativa,
              atividadeEconomica: e.atividadeEconomica || c.atividadeEconomica,
              confidence: e.confidence || 0,
              socios: e.socios || [],
              emails: [...new Set([...(c.emails || []), ...(e.emails || [])])],
              telefones: [...new Set([...(c.telefones || []), ...(e.telefones || [])])],
              contatos: {
                ...c.contatos,
                emails: [...new Set([...(c.contatos?.emails||[]), ...(e.emails||[])])],
                telefones: [...new Set([...(c.contatos?.telefones||[]), ...(e.telefones||[])])],
              },
              dataAbertura: e.dataAbertura || null,
              capitalSocial: e.capitalSocial || null,
              naturezaJuridica: e.naturezaJuridica || null,
              source: e.source || null,
            };
          });
        } catch (err) {
          console.warn("Backend enrichment failed:", err.message);
          enriched = baseCompanies.map(c => ({ ...c, cnpj: "Backend indisponível" }));
        }
      } else {
        enriched = baseCompanies.map(c => ({ ...c, cnpj: "Configure o backend" }));
      }
      setLoadStep(4);

      // Step 4 — Filter & sort
      let filtered = enriched;
      if (selectedPortes.length > 0) filtered = enriched.filter(c => selectedPortes.includes(c.porte));
      filtered.sort((a, b) => a.distancia - b.distancia);

      await new Promise(r => setTimeout(r, 350));
      setResults(filtered);
      setSearchMeta({ address, radius, portes: selectedPortes.length ? selectedPortes : PORTES });
      setPage("results");

    } catch (e) {
      console.error(e);
      setSearchError(e.message || "Erro inesperado. Verifique a API Key e tente novamente.");
      setPage("search");
    }
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="noise"/><div className="grid-bg"/>
        <div className="glow g1"/><div className="glow g2"/>
        <div className="pg">

          {/* TOPBAR */}
          <div className="topbar">
            <div className="logo"><Ic d={I.map} size={19} color="#030810"/></div>
            <div><div className="tb-title">LeadRadar</div><div className="tb-sub">Inteligência comercial por geolocalização</div></div>
            <div className="tb-pill">Google Places + Receita Federal</div>
          </div>

          {/* SEARCH */}
          {page === "search" && (
            <>
              <div className="sw">
                {/* LEFT */}
                <div className="sl">
                  <div className="hero">Encontre<br/>leads onde<br/>estão.</div>
                  <div className="tagline">Busca real por geolocalização. Dados de CNPJ,<br/>sócios, e-mails e situação cadastral via Receita Federal.</div>
                  <div className="chips">
                    <div className="chip"><div className="cdot"/>Backend Node.js</div>
                    <div className="chip"><div className="cdot"/>Google Places API</div>
                    <div className="chip"><div className="cdot"/>BrasilAPI / Receita</div>
                    <div className="chip"><div className="cdot"/>CNPJ.ws · ReceitaWS</div>
                  </div>
                </div>

                {/* FORM */}
                <div className="fc">
                  <div className="fs">
                    <div className="fl"><Ic d={I.location} size={12}/>Endereço <span className="req">obrigatório</span></div>
                    <div className="iw">
                      <span className="ii"><Ic d={I.location} size={14}/></span>
                      <input type="text" placeholder="Ex: Av. Paulista, 1000, São Paulo — SP"
                        value={address} onChange={e => setAddress(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleSearch()}/>
                    </div>
                  </div>

                  <div className="fs">
                    <div className="fl"><Ic d={I.radius} size={12}/>Raio de busca <span className="req">obrigatório</span></div>
                    <div className="rrow">
                      <input type="range" className="slider" min={0.5} max={10} step={0.5} value={radius}
                        onChange={e => setRadius(Number(e.target.value))}/>
                      <div className="rv">{radius} km</div>
                    </div>
                    <div style={{fontSize:10,color:"var(--t4)",marginTop:6}}>Máx. 10 km para respeitar cotas da API</div>
                  </div>

                  <hr className="dv"/>

                  <div className="fs" style={{marginBottom:22}}>
                    <div className="fl"><Ic d={I.filter} size={12}/>Porte <span style={{color:"var(--t4)",fontSize:9}}>opcional</span></div>
                    <div className="pg-grid">
                      {PORTES.map(p => {
                        const c = PORTE_COLORS[p], on = selectedPortes.includes(p);
                        return (
                          <button key={p} className={`pb${on?" on":""}`} onClick={() => togglePorte(p)}>
                            <div className="pd" style={{background:on?"var(--a1)":c.text}}/>{p}
                          </button>
                        );
                      })}
                    </div>
                    {selectedPortes.length === 0 && <div style={{fontSize:10,color:"var(--t4)",marginTop:6}}>Nenhum = todos os portes</div>}
                  </div>

                  {searchError && (
                    <div className="err-box"><Ic d={I.alert} size={14} color="var(--err)"/><span>{searchError}</span></div>
                  )}

                  <button className="btn-go" onClick={handleSearch} disabled={!address.trim()}>
                    <Ic d={I.search} size={16} color="#030810"/>Buscar Leads Reais
                  </button>
                </div>
              </div>
            </>
          )}

          {/* LOADING */}
          {page === "loading" && <Loader step={loadStep}/>}

          {/* RESULTS */}
          {page === "results" && (
            <div className="rp">
              <div className="rb">
                <button className="bbk" onClick={() => setPage("search")}><Ic d={I.back} size={13}/>Nova Busca</button>
                <div className="rh">Resultados</div>
                <div className="bc">{results.length} empresa{results.length!==1?"s":""}</div>
              </div>
              <div className="ftags">
                <div className="ft"><Ic d={I.location} size={10}/><b>{searchMeta.address}</b></div>
                <div className="ft"><Ic d={I.radius} size={10}/>Raio: <b>{searchMeta.radius} km</b></div>
                {(searchMeta.portes||[]).map(p => <div key={p} className="ft">{p}</div>)}
              </div>
              {results.length === 0 ? (
                <div className="empty">
                  <div className="empty-ico">🔭</div>
                  <div className="empty-t">Nenhuma empresa encontrada</div>
                  <div>Tente ampliar o raio ou alterar os filtros.</div>
                </div>
              ) : (
                <div className="rgrid">
                  {results.map((c,i) => <CompanyCard key={c.id} company={c} index={i} onContact={setContactCompany}/>)}
                </div>
              )}
            </div>
          )}

        </div>
        {contactCompany && <ContactModal company={contactCompany} onClose={() => setContactCompany(null)}/>}
      </div>
    </>
  );
}
