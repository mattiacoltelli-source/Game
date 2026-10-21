#!/usr/bin/env python3
"""Scarica da OpenStreetMap (Overpass) strade, edifici e aree verdi/acqua di Bologna
e li salva come JSON compatti in data/. Si esegue UNA volta; il gioco non chiama API.
Uso: python3 tools/build_data.py [--raw cache.json]
"""
import json, math, sys, time, urllib.request, urllib.parse, os

BBOX = (44.485, 11.328, 44.525, 11.372)  # sud, ovest, nord, est
ORIGIN = (44.5000, 11.3500)              # (lat, lon) -> (0,0) in metri
ENDPOINTS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
OUT = os.path.join(os.path.dirname(__file__), "..", "data")
R = 6371000.0
LAT0, LON0 = map(math.radians, ORIGIN)

def proj(lat, lon):
    """x = est, z = sud (metri). Proiezione equirettangolare locale."""
    x = (math.radians(lon) - LON0) * math.cos(LAT0) * R
    z = -(math.radians(lat) - LAT0) * R
    return x, z

def overpass(query):
    last = None
    for ep in ENDPOINTS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": query}).encode(),
                                             headers={"User-Agent": "bologna-taxi-game-build/0.1"})
                with urllib.request.urlopen(req, timeout=180) as r:
                    return json.loads(r.read())
            except Exception as e:
                last = e; print("  fallito", ep, e, file=sys.stderr); time.sleep(3)
    raise SystemExit(f"Overpass non raggiungibile: {last}")

b = ",".join(map(str, BBOX))
Q = f"""[out:json][timeout:180];
(
  way["highway"]({b});
  way["building"]({b});
  way["leisure"~"^(park|garden|pitch|playground)$"]({b});
  way["landuse"~"^(grass|forest|recreation_ground|village_green|meadow)$"]({b});
  way["natural"~"^(water|wood)$"]({b});
  way["waterway"~"^(river|canal)$"]({b});
  way["railway"="rail"]({b});
);
out geom;"""

raw_path = None
if "--raw" in sys.argv:
    raw_path = sys.argv[sys.argv.index("--raw") + 1]
if raw_path and os.path.exists(raw_path):
    data = json.load(open(raw_path))
else:
    data = overpass(Q)
    if raw_path: json.dump(data, open(raw_path, "w"))
els = data["elements"]
print("elementi OSM:", len(els))

# larghezza (m) e carreggiabilità per classe di strada
HW = {  # classe: (larghezza, guidabile)
    "motorway": (12, 1), "motorway_link": (7, 1), "trunk": (12, 1), "trunk_link": (7, 1),
    "primary": (10, 1), "primary_link": (7, 1), "secondary": (9, 1), "secondary_link": (7, 1),
    "tertiary": (8, 1), "tertiary_link": (6, 1), "unclassified": (6.5, 1), "residential": (6.5, 1),
    "living_street": (5.5, 1), "service": (4.5, 1), "pedestrian": (6, 1), "track": (4, 1),
    "cycleway": (2.5, 0), "footway": (2.5, 0), "path": (2, 0), "steps": (2, 0),
}
def r1(v): return round(v, 1)

def flat(geom, close=False):
    out = []
    for g in geom:
        x, z = proj(g["lat"], g["lon"]); out += [r1(x), r1(z)]
    return out

def height(t):
    h = t.get("height") or t.get("building:height")
    try:
        if h: return max(3.0, float(str(h).replace("m", "").strip()))
    except ValueError: pass
    lv = t.get("building:levels")
    try:
        if lv: return max(3.0, float(lv) * 3.1 + 1.0)
    except ValueError: pass
    return None

roads, buildings, areas, rails = [], [], [], []
hsum = hn = 0
for e in els:
    if e["type"] != "way" or "geometry" not in e: continue
    t = e.get("tags", {})
    pts = flat(e["geometry"])
    if len(pts) < 4: continue
    if "highway" in t:
        w, ok = HW.get(t["highway"], (0, 0))
        if not ok: continue
        if t.get("area") == "yes": continue
        if t.get("width"):
            try: w = max(2.5, min(20, float(t["width"])))
            except ValueError: pass
        roads.append({"c": t["highway"], "w": w, "n": t.get("name", ""), "p": pts})
    elif "building" in t:
        if len(pts) < 8: continue
        h = height(t)
        if h: hsum += h; hn += 1
        buildings.append({"h": h, "p": pts})
    elif "railway" in t:
        rails.append({"p": pts})
    elif "waterway" in t:
        areas.append({"k": "river", "p": pts})
    else:
        k = "water" if t.get("natural") == "water" else ("wood" if (t.get("natural") == "wood" or t.get("landuse") == "forest") else "green")
        if len(pts) >= 8: areas.append({"k": k, "p": pts})

avg = hsum / hn if hn else 12
DEFAULT_H = 12.0  # ~4 piani, plausibile per il centro di Bologna
print(f"strade: {len(roads)}  edifici: {len(buildings)} (con altezza {hn}, media {avg:.1f} m)  aree: {len(areas)}  ferrovia: {len(rails)}")
for bd in buildings:
    bd["h"] = round(bd["h"], 1) if bd["h"] else DEFAULT_H

os.makedirs(OUT, exist_ok=True)
x0, z0 = proj(BBOX[2], BBOX[1]); x1, z1 = proj(BBOX[0], BBOX[3])
meta = {"origin": ORIGIN, "bbox": BBOX, "bounds": [r1(x0), r1(z0), r1(x1), r1(z1)]}
def dump(name, obj):
    path = os.path.join(OUT, name)
    with open(path, "w") as f: json.dump(obj, f, separators=(",", ":"))
    print(f"  {name}: {os.path.getsize(path)/1024:.0f} KB")
dump("roads.json", {"meta": meta, "roads": roads, "rails": rails})
dump("buildings.json", {"meta": meta, "defaultHeight": DEFAULT_H, "buildings": buildings})
dump("areas.json", {"meta": meta, "areas": areas})
