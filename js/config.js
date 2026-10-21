// Dati di gioco: tutto ciò che è "contenuto" sta qui, così aggiungere punti cliente = aggiungere una riga.
export const DATA_URLS = {
  roads: 'data/roads.json',
  buildings: 'data/buildings.json',
  areas: 'data/areas.json',
};

// Partenza: vicolo laterale su Via Alfonso Lombardi (Bolognina). Viene agganciata alla strada più vicina.
export const START = {
  lat: 44.51614, lon: 11.35259,
  facing: { lat: 44.51589, lon: 11.35243 }, // verso Via Alfonso Lombardi
};

// Punti cliente (per ora uno solo). `raggio` = raggio del cerchio di carico in metri.
// In futuro: Centro di Raccolta Hera, IIS Aldini Valeriani (Via Sario Bassanelli / Via di Corticella).
export const CUSTOMERS = [
  { id: 'fiera', nome: 'Fiera di Bologna', lat: 44.5122686, lon: 11.3595329, raggio: 18 },
];

export const DESTINATION = { id: 'piazza-maggiore', nome: 'Piazza Maggiore', lat: 44.4936561, lon: 11.3430486, raggio: 20 };

export const VIEW = { cell: 250, loadRadius: 520, fogNear: 110, fogFar: 330 };
