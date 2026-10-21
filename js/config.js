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

// Punti cliente (per ora uno solo). `raggio` = raggio del cerchio in metri. La corsa finisce quando ci si ferma nel cerchio.
// In futuro: Centro di Raccolta Hera, IIS Aldini Valeriani (Via Sario Bassanelli / Via di Corticella),
// e la seconda tratta verso Piazza Maggiore (44.4936561, 11.3430486).
export const CUSTOMERS = [
  { id: 'fiera', nome: 'Fiera di Bologna', lat: 44.5122686, lon: 11.3595329, raggio: 18 },
];


// Fermarsi nel cerchio = velocità sotto questa soglia (m/s).
export const STOP_SPEED = 4;

export const VIEW = { cell: 250, loadRadius: 520, fogNear: 110, fogFar: 330 };
