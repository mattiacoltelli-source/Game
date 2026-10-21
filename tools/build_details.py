#!/usr/bin/env python3
"""Dettagli del corridoio di gioco (insegne, strisce pedonali, fermate, dissuasori, alberi) -> data/details.json.
Il corridoio è il percorso stradale reale della corsa (partenza -> cliente -> Fiera, passando da Via Indipendenza e Ponte Matteotti)
con un buffer di 70 m: il dettaglio alto sta solo lì, per non appesantire il telefono.
Uso: python3 tools/build_details.py [--cache DIR]   (dopo build_data.py; DIR conserva le risposte Overpass)
"""
import json, math, os, sys, time, heapq, urllib.request, urllib.parse

HERE = os.path.dirname(__file__); DATA = os.path.join(HERE, "..", "data")
CACHE = sys.argv[sys.argv.index("--cache") + 1] if "--cache" in sys.argv else None
ENDPOINTS = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"]
roads_j = json.load(open(os.path.join(DATA, "roads.json"))); meta = roads_j["meta"]; roads = roads_j["roads"]
bld = json.load(open(os.path.join(DATA, "buildings.json")))["buildings"]
ORIGIN = meta["origin"]; R = 6371000.0; LA0, LO0 = math.radians(ORIGIN[0]), math.radians(ORIGIN[1])
proj = lambda lat, lon: ((math.radians(lon) - LO0) * math.cos(LA0) * R, -(math.radians(lat) - LA0) * R)
inv = lambda x, z: (math.degrees(LA0 - z / R), math.degrees(LO0 + x / (R * math.cos(LA0))))

# ---- corridoio: percorso più breve attraverso i punti di passaggio (metri locali)
WAYPOINTS = [proj(44.494478, 11.345007), proj(44.494262, 11.342763), (-393, -375), (-338, -668), proj(44.5122686, 11.3595329)]  # partenza, Nettuno, Indipendenza nord, Matteotti, Fiera
key = lambda x, z: (round(x * 4), round(z * 4)); adj = {}; pos = {}
for r in roads:
    if r["c"] in ("motorway", "trunk_link", "motorway_link", "track", "service"): continue
    p = r["p"]
    for i in range(len(p) // 2 - 1):
        a, b = key(p[i*2], p[i*2+1]), key(p[i*2+2], p[i*2+3]); d = math.hypot(p[i*2] - p[i*2+2], p[i*2+1] - p[i*2+3])
        pos[a] = (p[i*2], p[i*2+1]); pos[b] = (p[i*2+2], p[i*2+3]); adj.setdefault(a, []).append((b, d)); adj.setdefault(b, []).append((a, d))
near_node = lambda x, z: min(pos, key=lambda k: (pos[k][0] - x) ** 2 + (pos[k][1] - z) ** 2)
def route(s, g):
    dist = {s: 0}; prev = {}; pq = [(0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == g: break
        if d > dist[u]: continue
        for v, w in adj[u]:
            nd = d + w
            if nd < dist.get(v, 1e18): dist[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
    path = []; k = g
    while True:
        path.append(pos[k])
        if k == s: break
        k = prev[k]
    return path[::-1]
full = []
for a, b in zip(WAYPOINTS, WAYPOINTS[1:]):
    seg = route(near_node(*a), near_node(*b)); full += seg if not full else seg[1:]
corr = [full[0]]
for q in full[1:]:
    if math.hypot(q[0] - corr[-1][0], q[1] - corr[-1][1]) >= 25: corr.append(q)
corr.append(full[-1])
print("corridoio:", len(corr), "punti")

# ---- Overpass lungo il corridoio (con cache)
poly = ",".join(f"{a:.5f},{b:.5f}" for a, b in (inv(x, z) for x, z in corr)); AROUND = f"(around:70,{poly})"
def overpass(name, body, tolerant=True):
    path = os.path.join(CACHE, f"corr_{name}.json") if CACHE else None
    if path and os.path.exists(path): return json.load(open(path))
    q = f"[out:json][timeout:60];({body}{AROUND};);out center tags;"
    for ep in ENDPOINTS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": "bologna-taxi-game-build/0.1"})
                with urllib.request.urlopen(req, timeout=75) as r: j = json.loads(r.read())
                if path: json.dump(j, open(path, "w"))
                return j
            except Exception as e: print("  fallito", name, ep.split("/")[2], e, file=sys.stderr); time.sleep(3)
    print("  saltato:", name, file=sys.stderr); return {"elements": []}
shops = overpass("shops", 'nwr["name"]["shop"];nwr["name"]["amenity"~"^(cafe|bar|pub|restaurant|fast_food|pharmacy|bank|ice_cream|cinema|theatre|post_office|marketplace|fuel|bicycle_rental|nightclub|library|clinic|dentist)$"];nwr["name"]["tourism"~"^(hotel|hostel|museum|gallery|guest_house)$"];nwr["name"]["office"];')
cross = overpass("crossing", 'node["highway"="crossing"]'); bus = overpass("bus", 'node["highway"="bus_stop"]')
boll = overpass("bollard", 'node["barrier"="bollard"]'); trees = overpass("tree", 'node["natural"="tree"]')

def ll(e):
    lat = e.get("lat") or e.get("center", {}).get("lat"); lon = e.get("lon") or e.get("center", {}).get("lon")
    return proj(lat, lon) if lat is not None else None

# ---- indice edifici e strade
BG = 40; bgrid = {}
for bi, b in enumerate(bld):
    p = b["p"]; xs, zs = p[0::2], p[1::2]
    for gx in range(int(min(xs) // BG), int(max(xs) // BG) + 1):
        for gz in range(int(min(zs) // BG), int(max(zs) // BG) + 1): bgrid.setdefault((gx, gz), []).append(bi)
def inside(x, z, p):
    n = len(p) // 2; ins = False
    for i in range(n):
        j = (i + 1) % n
        if (p[i*2+1] > z) != (p[j*2+1] > z) and x < (p[j*2] - p[i*2]) * (z - p[i*2+1]) / (p[j*2+1] - p[i*2+1]) + p[i*2]: ins = not ins
    return ins
def in_building(x, z): return any(inside(x, z, bld[bi]["p"]) for bi in bgrid.get((int(x // BG), int(z // BG)), ()))
def seg_near(x, z, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az; L2 = dx * dx + dz * dz or 1e-9; t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / L2)); qx, qz = ax + dx * t, az + dz * t
    return math.hypot(x - qx, z - qz), qx, qz, dx / math.sqrt(L2), dz / math.sqrt(L2)
RG = 40; rgrid = {}
for ri, r in enumerate(roads):
    if r["c"] not in ("primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "pedestrian", "trunk"): continue
    p = r["p"]
    for i in range(len(p) // 2 - 1):
        for gx in range(int(min(p[i*2], p[i*2+2]) // RG), int(max(p[i*2], p[i*2+2]) // RG) + 1):
            for gz in range(int(min(p[i*2+1], p[i*2+3]) // RG), int(max(p[i*2+1], p[i*2+3]) // RG) + 1): rgrid.setdefault((gx, gz), []).append((ri, i))
def nearest_road(x, z, maxd):
    best = None
    for gx in (int(x // RG) - 1, int(x // RG), int(x // RG) + 1):
        for gz in (int(z // RG) - 1, int(z // RG), int(z // RG) + 1):
            for ri, i in rgrid.get((gx, gz), ()):
                p = roads[ri]["p"]; d, qx, qz, ux, uz = seg_near(x, z, p[i*2], p[i*2+1], p[i*2+2], p[i*2+3])
                if d < maxd and (not best or d < best[0]): best = (d, qx, qz, ux, uz, roads[ri])
    return best
def corr_dist(x, z): return min(seg_near(x, z, corr[i][0], corr[i][1], corr[i+1][0], corr[i+1][1])[0] for i in range(len(corr) - 1))

# ---- insegne: sul lato di facciata più vicino al punto
CAT = {"shop": "s", "cafe": "f", "bar": "f", "pub": "f", "restaurant": "f", "fast_food": "f", "ice_cream": "f", "nightclub": "f", "pharmacy": "p", "bank": "b", "hotel": "h", "hostel": "h", "guest_house": "h",
       "museum": "c", "gallery": "c", "cinema": "c", "theatre": "c", "library": "c", "post_office": "b", "fuel": "o", "clinic": "p", "dentist": "p", "marketplace": "s", "bicycle_rental": "o"}
def cat_of(t):
    for k in ("shop", "amenity", "tourism"):
        if t.get(k):
            if k == "shop": return "s"
            if t[k] in CAT: return CAT[t[k]]
    return "o"
signs, taken = [], []
for e in shops["elements"]:
    t = e.get("tags", {}); P = ll(e)
    if not P or not t.get("name"): continue
    best = None
    for bi in bgrid.get((int(P[0] // BG), int(P[1] // BG)), ()):
        p = bld[bi]["p"]; n = len(p) // 2
        if bld[bi].get("k") or bld[bi]["h"] < 5: continue
        for i in range(n):
            j = (i + 1) % n; L = math.hypot(p[j*2] - p[i*2], p[j*2+1] - p[i*2+1])
            if L < 3: continue
            d, qx, qz, ux, uz = seg_near(P[0], P[1], p[i*2], p[i*2+1], p[j*2], p[j*2+1])
            if d < 14 and (not best or d < best[0]): best = (d, qx, qz, ux, uz, bi, i, L)
    if not best: continue
    d, qx, qz, ux, uz, bi, i, L = best; p = bld[bi]["p"]
    nx, nz = uz, -ux
    if inside(qx + nx * 0.6, qz + nz * 0.6, p): nx, nz = -nx, -nz   # normale verso l'esterno
    if any(math.hypot(qx - a, qz - b) < 3.2 for a, b in taken): continue
    taken.append((qx, qz)); arc = i in (bld[bi].get("a") or [])
    name = t["name"].strip(); name = name if len(name) <= 24 else name[:23] + "…"
    signs.append({"n": name, "c": cat_of(t), "x": round(qx, 1), "z": round(qz, 1), "nx": round(nx, 2), "nz": round(nz, 2), "y": 5.5 if arc else 3.3, "w": round(min(L * 0.85, max(2.0, 0.17 * len(name) + 1.0)), 1)})
signs = [s for s in signs if corr_dist(s["x"], s["z"]) < 75][:260]
print("insegne:", len(signs))

# ---- strisce pedonali, fermate, dissuasori, alberi
crossings = []
for e in cross["elements"]:
    P = ll(e)
    if not P: continue
    nr = nearest_road(P[0], P[1], 5)
    if not nr or nr[5]["c"] in ("pedestrian", "living_street"): continue
    if any(math.hypot(P[0] - c[0], P[1] - c[1]) < 4 for c in crossings): continue
    crossings.append([round(nr[1], 1), round(nr[2], 1), round(nr[3], 2), round(nr[4], 2), nr[5]["w"]])
buses = []
for e in bus["elements"]:
    P = ll(e)
    if not P: continue
    nr = nearest_road(P[0], P[1], 14)
    if not nr: continue
    side = 1 if (P[0] - nr[1]) * (-nr[4]) + (P[1] - nr[2]) * nr[3] >= 0 else -1
    buses.append([round(P[0], 1), round(P[1], 1), round(nr[3], 2), round(nr[4], 2), side])
bollards = [[round(P[0], 1), round(P[1], 1)] for e in boll["elements"] if (P := ll(e)) and not in_building(*P)][:420]
tree_pts = [[round(P[0], 1), round(P[1], 1)] for e in trees["elements"] if (P := ll(e)) and not in_building(*P)][:900]
print(f"strisce: {len(crossings)}  fermate: {len(buses)}  dissuasori: {len(bollards)}  alberi: {len(tree_pts)}")
out = {"meta": meta, "corridor": [[round(x, 1), round(z, 1)] for x, z in corr], "signs": signs, "crossings": crossings, "bus": buses, "bollards": bollards, "trees": tree_pts}
path = os.path.join(DATA, "details.json"); json.dump(out, open(path, "w"), separators=(",", ":")); print(f"details.json: {os.path.getsize(path)/1024:.0f} KB")
