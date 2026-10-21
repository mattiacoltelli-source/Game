# Taxi Bologna
Gioco di taxi a tempo ambientato a Bologna (mobile, orizzontale). Three.js vanilla, tutto statico.

- `tools/build_data.py`: scarica strade/edifici/aree da OpenStreetMap (Overpass) → `data/*.json`. Si lancia una volta.
- `js/config.js`: partenza, punti cliente (lista di dati), destinazione.
- Test locale: `python3 -m http.server` e apri `http://localhost:8000/?debug`.

Dati © collaboratori di OpenStreetMap, licenza ODbL.
