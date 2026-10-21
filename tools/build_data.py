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

def overpass(query, tolerant=False, timeout=180):
    last = None
    for ep in ENDPOINTS:
        for attempt in range(1 if tolerant else 2):
            try:
                req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": query}).encode(),
                                             headers={"User-Agent": "bologna-taxi-game-build/0.1"})
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    return json.loads(r.read())
            except Exception as e:
                last = e; print("  fallito", ep, e, file=sys.stderr); time.sleep(3)
    if tolerant: return None
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

QP = f"""[out:json][timeout:120];
(
 nwr["name"]["railway"~"^(station|halt)$"]({b});
 nwr["name"]["amenity"~"^(hospital|theatre|townhall|marketplace|courthouse|bus_station|exhibition_centre|conference_centre|arts_centre|cinema)$"]({b});
 nwr["name"]["tourism"~"^(attraction|museum|gallery|viewpoint)$"]({b});
 nwr["name"]["historic"~"^(monument|city_gate|castle|ruins|tower|fountain)$"]({b});
 nwr["name"]["leisure"~"^(park|garden|stadium|sports_centre)$"]({b});
 nwr["name"]["place"="square"]({b});
 nwr["name"]["man_made"~"^(tower|water_tower)$"]({b});
 nwr["name"]["shop"~"^(mall|department_store)$"]({b});
 nwr["name"]["building"~"^(church|cathedral|bell_tower|stadium|train_station|exhibition_center)$"]({b});
 nwr["name"]["amenity"="place_of_worship"]({b});
 way["name"]["bridge"="yes"]["highway"~"^(primary|secondary|tertiary|trunk)$"]({b});
);
out center tags;"""

QP2 = f"""[out:json][timeout:60];(nwr["name"]["amenity"="school"]({b});nwr["name"]["shop"="supermarket"]({b}););out center tags;"""

raw_path = None
if "--raw" in sys.argv:
    raw_path = sys.argv[sys.argv.index("--raw") + 1]
if raw_path and os.path.exists(raw_path):
    data = json.load(open(raw_path))
else:
    data = overpass(Q)
    if raw_path: json.dump(data, open(raw_path, "w"))
poi_path = raw_path + ".poi" if raw_path else None
if poi_path and os.path.exists(poi_path):
    poi_data = json.load(open(poi_path))
else:
    poi_data = overpass(QP)
    if poi_path: json.dump(poi_data, open(poi_path, "w"))
poi2_path = raw_path + ".poi2" if raw_path else None
if poi2_path and os.path.exists(poi2_path):
    poi2 = json.load(open(poi2_path))
else:
    poi2 = overpass(QP2, tolerant=True, timeout=90)  # scuole e supermercati: facoltativo, se il mirror è lento si salta
    if poi2 and poi2_path: json.dump(poi2, open(poi2_path, "w"))
if poi2: poi_data["elements"] += poi2["elements"]
else: print("scuole/supermercati: saltati (Overpass lento)", file=sys.stderr)
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

# Monumenti con modello dedicato nel gioco: id way OSM -> (stile, altezza m)
LANDMARKS = {
    46965352: ("asinelli", 97), 46965353: ("garisenda", 48), 328013918: ("petronio", 42),
    149211251: ("torre", 59), 149211257: ("torre", 61), 149041036: ("torre", 48), 149211222: ("torre", 39),
    149211166: ("torre", 25), 149211218: ("torre", 20), 148846459: ("torre", 30),
    1173957347: ("arengo", 40), 149041465: ("orologio", 30), 149040859: ("accursio", 22), 149040903: ("reenzo", 19),
    149040794: ("podesta", 24), 325434925: ("cattedrale", 33), 149041309: ("salaborsa", 22),
}

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

roads, buildings, areas, rails, arcades, bridges_raw = [], [], [], [], [], []
BTYPE = {'church': 1, 'cathedral': 1, 'chapel': 1, 'bell_tower': 1, 'hospital': 2, 'school': 3, 'university': 3, 'college': 3, 'kindergarten': 3,
         'industrial': 4, 'warehouse': 4, 'factory': 4, 'garage': 4, 'garages': 4, 'retail': 5, 'commercial': 5, 'office': 5, 'supermarket': 5, 'hotel': 5,
         'apartments': 6, 'residential': 6, 'house': 6, 'terrace': 6}
hsum = hn = 0
for e in els:
    if e["type"] != "way" or "geometry" not in e: continue
    t = e.get("tags", {})
    pts = flat(e["geometry"])
    if len(pts) < 4: continue
    if (t.get("area:highway") in ("pedestrian", "footway") or (t.get("highway") == "pedestrian" and t.get("area") == "yes") or t.get("place") == "square") and len(pts) >= 8:
        areas.append({"k": "plaza", "p": pts})
        continue
    if t.get("bridge") == "yes" and t.get("highway") in ("primary", "secondary", "tertiary", "trunk", "unclassified", "residential"):
        bridges_raw.append({"id": e["id"], "n": t.get("name", ""), "w": HW.get(t["highway"], (7, 1))[0], "p": pts})
    if t.get("highway") == "footway" and t.get("covered") in ("arcade", "colonnade"):
        arcades.append(pts)
        continue
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
        bd = {"h": h, "p": pts}
        bt = BTYPE.get(t["building"])
        if bt: bd["t"] = bt
        lm = LANDMARKS.get(e["id"])
        if lm:
            bd["k"] = lm[0]; bd["h"] = lm[1]
        buildings.append(bd)
    elif "railway" in t:
        rails.append({"p": pts})
    elif "waterway" in t:
        areas.append({"k": "river", "p": pts})
    else:
        k = "water" if t.get("natural") == "water" else ("wood" if (t.get("natural") == "wood" or t.get("landuse") == "forest") else "green")
        if len(pts) >= 8: areas.append({"k": k, "p": pts})

# Edifici che coprono l'asse di una strada (cavalcavia, passaggi, portici mappati come "building"):
# bloccherebbero strade reali, quindi si scartano. Serve che l'asse stia dentro per >= ~4 m e >1.5 m dal bordo.
def seg_dist(px, pz, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az; L2 = dx * dx + dz * dz or 1e-9
    t = max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L2))
    return math.hypot(px - ax - t * dx, pz - az - t * dz)

G = 50
samples = {}
for rd in roads:
    p = rd["p"]
    for i in range(len(p) // 2 - 1):
        ax, az, bx, bz = p[i*2], p[i*2+1], p[i*2+2], p[i*2+3]
        n = max(1, int(math.hypot(bx - ax, bz - az) // 2))
        for k in range(n + 1):
            x, z = ax + (bx - ax) * k / n, az + (bz - az) * k / n
            samples.setdefault((int(x // G), int(z // G)), []).append((x, z, rd["n"] or rd["c"]))
kept, dropped = [], {}
for bd in buildings:
    p = bd["p"]; n = len(p) // 2
    xs, zs = p[0::2], p[1::2]
    cnt = 0; names = set()
    for gx in range(int(min(xs) // G), int(max(xs) // G) + 1):
        for gz in range(int(min(zs) // G), int(max(zs) // G) + 1):
            for x, z, nm in samples.get((gx, gz), ()):
                if x < min(xs) or x > max(xs) or z < min(zs) or z > max(zs): continue
                ins = False
                for i in range(n):
                    j = (i + 1) % n
                    if (zs[i] > z) != (zs[j] > z) and x < (xs[j] - xs[i]) * (z - zs[i]) / (zs[j] - zs[i]) + xs[i]: ins = not ins
                if ins and min(seg_dist(x, z, xs[i], zs[i], xs[(i+1) % n], zs[(i+1) % n]) for i in range(n)) > 1.5:
                    cnt += 1; names.add(nm)
    if cnt >= 2 and not bd.get("k"):
        for nm in names: dropped[nm] = dropped.get(nm, 0) + 1
    else: kept.append(bd)
print(f"edifici scartati perché coprono una strada: {len(buildings) - len(kept)}", sorted(dropped.items(), key=lambda kv: -kv[1])[:8])
buildings = kept

avg = hsum / hn if hn else 12
DEFAULT_H = 12.0  # ~4 piani, plausibile per il centro di Bologna
print(f"strade: {len(roads)}  edifici: {len(buildings)} (con altezza {hn}, media {avg:.1f} m)  aree: {len(areas)}  ferrovia: {len(rails)}")
for bd in buildings:
    bd["h"] = round(bd["h"], 1) if bd["h"] else DEFAULT_H
print("monumenti:", sorted(b["k"] for b in buildings if b.get("k")))

x0, z0 = proj(BBOX[2], BBOX[1]); x1, z1 = proj(BBOX[0], BBOX[3])
# --- lati di edificio affacciati su un portico (footway covered=arcade): indici in "a"
AG = 20
asamp = {}
for ap in arcades:
    for i in range(len(ap) // 2 - 1):
        ax, az, bx, bz = ap[i*2], ap[i*2+1], ap[i*2+2], ap[i*2+3]
        L = math.hypot(bx - ax, bz - az) or 1; n = max(1, int(L // 2))
        for k in range(n + 1):
            asamp.setdefault((int((ax + (bx-ax)*k/n) // AG), int((az + (bz-az)*k/n) // AG)), []).append((ax + (bx-ax)*k/n, az + (bz-az)*k/n, (bx-ax)/L, (bz-az)/L))
nflag = 0
for bd in buildings:
    p = bd["p"]; n = len(p) // 2
    if p[0] == p[-2] and p[1] == p[-1]: n -= 1
    fl = []
    for i in range(n):
        j = (i + 1) % n; ax, az, bx, bz = p[i*2], p[i*2+1], p[j*2], p[j*2+1]
        L = math.hypot(bx - ax, bz - az)
        if L < 3: continue
        ux, uz = (bx - ax) / L, (bz - az) / L; mx, mz = (ax + bx) / 2, (az + bz) / 2; ok = False
        for gx in (int(mx // AG) - 1, int(mx // AG), int(mx // AG) + 1):
            for gz in (int(mz // AG) - 1, int(mz // AG), int(mz // AG) + 1):
                for sx, sz, dx, dz in asamp.get((gx, gz), ()):
                    if math.hypot(sx - mx, sz - mz) < 3.4 and abs(ux * dx + uz * dz) > 0.85: ok = True; break
                if ok: break
            if ok: break
        if ok: fl.append(i)
    if fl: bd["a"] = fl; nflag += len(fl)
print(f"portici: {len(arcades)} tratti, {nflag} lati di edificio con arcate")

# --- luoghi con nome (etichette): importanza per tipo, dedupe per nome, quota dell'edificio sottostante
def poi_kind(t):
    n = t.get("name", "")
    if t.get("railway") in ("station", "halt") or t.get("building") == "train_station": return "station", 1
    if t.get("historic") == "city_gate": return "gate", 1
    if t.get("historic") == "tower" or t.get("man_made") in ("tower", "water_tower") or t.get("building") == "bell_tower": return "tower", 1
    if t.get("amenity") == "hospital": return "hospital", 1
    if t.get("amenity") in ("exhibition_centre", "conference_centre"): return "fair", 1
    if t.get("place") == "square": return "square", 1
    if t.get("leisure") in ("park", "garden"): return "park", (1 if n.startswith(("Parco", "Giardini", "Montagnola")) else 2)
    if t.get("leisure") == "stadium" or t.get("building") == "stadium": return "sport", 1
    if t.get("leisure") == "sports_centre": return "sport", 2
    if t.get("amenity") in ("townhall", "courthouse", "theatre") : return "civic", 1
    if t.get("shop") in ("mall", "department_store"): return "shop", 1
    if t.get("tourism") == "attraction" or t.get("historic") in ("monument", "castle", "ruins", "fountain"): return "attraction", 1
    if t.get("amenity") == "marketplace": return "market", 1
    if t.get("bridge") == "yes": return "bridge", 1
    if t.get("building") in ("church", "cathedral") or t.get("amenity") == "place_of_worship":
        return "church", (1 if any(w in n for w in ("Basilica", "Cattedrale", "Duomo", "Santuario")) else 2)
    if t.get("tourism") in ("museum", "gallery") or t.get("amenity") in ("arts_centre", "cinema"): return "museum", 2
    if t.get("amenity") == "school": return "school", 2
    if t.get("shop") == "supermarket": return "shop", 2
    return None, 0

BG = 50; bgrid = {}
for bi, bd in enumerate(buildings):
    xs, zs = bd["p"][0::2], bd["p"][1::2]
    for gx in range(int(min(xs) // BG), int(max(xs) // BG) + 1):
        for gz in range(int(min(zs) // BG), int(max(zs) // BG) + 1): bgrid.setdefault((gx, gz), []).append(bi)
def height_at(x, z):
    best = 0
    for bi in bgrid.get((int(x // BG), int(z // BG)), ()):
        p = buildings[bi]["p"]; n = len(p) // 2; ins = False
        for i in range(n):
            j = (i + 1) % n
            if (p[i*2+1] > z) != (p[j*2+1] > z) and x < (p[j*2] - p[i*2]) * (z - p[i*2+1]) / (p[j*2+1] - p[i*2+1]) + p[i*2]: ins = not ins
        if ins: best = max(best, buildings[bi]["h"])
    return best
pois, seen = [], {}
mb = next((b for b in bridges_raw if "Matteotti" in b["n"]), None)
if mb: pois.append({"k": "bridge", "t": 1, "n": "Ponte Matteotti", "x": r1(mb["p"][len(mb["p"]) // 2 // 2 * 2]), "z": r1(mb["p"][len(mb["p"]) // 2 // 2 * 2 + 1]), "h": 12})
for e in poi_data["elements"]:
    t = e.get("tags", {}); kind, tier = poi_kind(t)
    if not kind: continue
    lat = e.get("lat") or e.get("center", {}).get("lat"); lon = e.get("lon") or e.get("center", {}).get("lon")
    if lat is None: continue
    x, z = proj(lat, lon); name = t["name"].strip()
    if name in seen and math.hypot(seen[name][0] - x, seen[name][1] - z) < 250: continue
    if not (x0 <= x <= x1 and z0 <= z <= z1): continue
    seen[name] = (x, z)
    pois.append({"k": kind, "t": tier, "n": name, "x": r1(x), "z": r1(z), "h": round(height_at(x, z) or 10, 0)})
print("luoghi:", len(pois), {k: sum(1 for q in pois if q["k"] == k) for k in sorted({q["k"] for q in pois})})

# --- Piazza Maggiore / Piazza Nettuno: non sono way chiuse in OSM; rettangoli di lastricato (gli edifici li coprono ai bordi)
nep = proj(44.4942648, 11.3426605)
for rect in ([(-602, 668), (-492, 668), (-492, 772), (-602, 772)],
             [(nep[0] - 38, nep[1] - 30), (nep[0] + 38, nep[1] - 30), (nep[0] + 38, nep[1] + 30), (nep[0] - 38, nep[1] + 30)]):
    areas.append({"k": "plaza", "p": [r1(c) for q in rect for c in q]})
# Fontana del Nettuno: ottagono con modello dedicato (e collisione)
buildings.append({"h": 7, "k": "nettuno", "p": [r1(c) for q in [(nep[0] + 4.2 * math.cos(k * math.pi / 4), nep[1] + 4.2 * math.sin(k * math.pi / 4)) for k in range(9)] for c in q]})

# --- ponti sopra ferrovia/acqua e non incrociati da altre strade: parapetti (visivi e con collisione)
def seg_hit(a, b, c, d, tol=0.0):
    def cr(o, p, q): return (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
    return cr(a, b, c) * cr(a, b, d) < 0 and cr(c, d, a) * cr(c, d, b) < 0
bridges = []
under = [r["p"] for r in rails] + [a["p"] for a in areas if a["k"] == "river"]
for br in bridges_raw:
    pts = [(br["p"][i], br["p"][i + 1]) for i in range(0, len(br["p"]), 2)]
    over = any(seg_hit(pts[i], pts[i + 1], (u[j*2], u[j*2+1]), (u[j*2+2], u[j*2+3])) for i in range(len(pts) - 1) for u in under for j in range(len(u) // 2 - 1))
    if not over: continue
    crossed = False
    for rd in roads:
        if rd.get("id") == br["id"] or rd["p"] == br["p"]: continue
        q = rd["p"]
        for i in range(len(pts) - 1):
            for j in range(len(q) // 2 - 1):
                c0, c1 = (q[j*2], q[j*2+1]), (q[j*2+2], q[j*2+3])
                if seg_hit(pts[i], pts[i + 1], c0, c1) and min(math.hypot(c0[0] - pts[k][0], c0[1] - pts[k][1]) for k in (0, -1)) > 15: crossed = True
    if not crossed: bridges.append({"n": br["n"], "w": br["w"], "p": br["p"]})
print("ponti con parapetti:", [(b["n"] or "-") for b in bridges])

# --- lampioni lungo strade principali e Via dell'Indipendenza (ogni ~38 m, lati alternati)
lamps, side, acc_all = [], 1, 0
for rd in roads:
    if not (rd["c"] in ("primary", "secondary", "trunk") or "Indipendenza" in rd["n"]): continue
    p = rd["p"]; off = rd["w"] / 2 + 1.1; nxt = 14.0; acc = 0.0
    for i in range(len(p) // 2 - 1):
        dx, dz = p[i*2+2] - p[i*2], p[i*2+3] - p[i*2+1]; L = math.hypot(dx, dz)
        while acc + L >= nxt and L > 0:
            f = (nxt - acc) / L; x, z = p[i*2] + dx * f, p[i*2+1] + dz * f
            side = -side; lamps += [r1(x - dz / L * off * side), r1(z + dx / L * off * side)]
            nxt += 38
        acc += L
print("lampioni:", len(lamps) // 2)

# --- ancore per i nomi delle strade: una ogni ~160 m per nome, solo strade con nome
NAMED_OK = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "pedestrian"}
anchors, agrid = [], {}
for rd in sorted(roads, key=lambda r: -r["w"]):
    if not rd["n"] or rd["c"] not in NAMED_OK: continue
    p = rd["p"]; tot = sum(math.hypot(p[i*2+2] - p[i*2], p[i*2+3] - p[i*2+1]) for i in range(len(p) // 2 - 1))
    if tot < 35: continue
    acc, nxt = 0.0, tot / 2
    for i in range(len(p) // 2 - 1):
        L = math.hypot(p[i*2+2] - p[i*2], p[i*2+3] - p[i*2+1])
        while acc + L >= nxt:
            f = (nxt - acc) / (L or 1); x, z = p[i*2] + (p[i*2+2] - p[i*2]) * f, p[i*2+1] + (p[i*2+3] - p[i*2+1]) * f
            near = any(a["n"] == rd["n"] and math.hypot(a["x"] - x, a["z"] - z) < 150 for a in agrid.get((int(x // 200), int(z // 200)), ()))
            if not near:
                a = {"n": rd["n"], "x": r1(x), "z": r1(z), "c": 1 if rd["c"] in ("motorway", "trunk", "primary", "secondary") else 0}
                anchors.append(a); agrid.setdefault((int(x // 200), int(z // 200)), []).append(a)
            nxt += 160
        acc += L
print("nomi strade:", len(anchors))

os.makedirs(OUT, exist_ok=True)
x0, z0 = proj(BBOX[2], BBOX[1]); x1, z1 = proj(BBOX[0], BBOX[3])
meta = {"origin": ORIGIN, "bbox": BBOX, "bounds": [r1(x0), r1(z0), r1(x1), r1(z1)]}
def dump(name, obj):
    path = os.path.join(OUT, name)
    with open(path, "w") as f: json.dump(obj, f, separators=(",", ":"))
    print(f"  {name}: {os.path.getsize(path)/1024:.0f} KB")
dump("roads.json", {"meta": meta, "roads": roads, "rails": rails, "arcades": len(arcades)})
dump("buildings.json", {"meta": meta, "defaultHeight": DEFAULT_H, "buildings": buildings})
dump("areas.json", {"meta": meta, "areas": areas})
dump("labels.json", {"meta": meta, "pois": pois, "streets": anchors})
dump("extras.json", {"meta": meta, "bridges": bridges, "lamps": lamps})
