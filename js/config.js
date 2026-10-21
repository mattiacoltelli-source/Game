// Dati di gioco: tutto ciò che è "contenuto" sta qui, così aggiungere punti cliente = aggiungere una riga.
export const DATA_URLS = {
  roads: 'data/roads.json',
  buildings: 'data/buildings.json',
  areas: 'data/areas.json',
  labels: 'data/labels.json',
  extras: 'data/extras.json',
  details: 'data/details.json',
};

// Corse: partenza + elenco di tappe (la prima è il cliente, l'ultima la destinazione). `raggio` = raggio del cerchio in metri;
// per completare una tappa ci si ferma nel cerchio. Punti agganciati alla strada più vicina.
// Aggiungere una corsa = aggiungere un oggetto (es. Centro di Raccolta Hera, IIS Aldini Valeriani in Via Sario Bassanelli / Via di Corticella).
export const RIDES = [
  {
    id: 'torri-fiera',
    // Via Rizzoli, ~85 m a ovest delle torri, auto già rivolta verso il cliente (ovest). La schermata iniziale inquadra le torri alle sue spalle.
    start: { nome: 'Due Torri', lat: 44.494361, lon: 11.345713, facing: { lat: 44.494532, lon: 11.344704 }, look: { lat: 44.49412, lon: 11.3467, y: 30 } },
    stops: [
      { id: 'nettuno', nome: 'Fontana del Nettuno', lat: 44.494262, lon: 11.342763, raggio: 11, goal: 'Vai dal cliente al Nettuno', boarded: 'Cliente a bordo' }, // a fianco della fontana, in Piazza Maggiore
      { id: 'fiera', nome: 'Fiera di Bologna', lat: 44.5122686, lon: 11.3595329, raggio: 18, goal: 'Porta il cliente alla Fiera' },
    ],
  },
];

// Fermarsi nel cerchio = velocità sotto questa soglia (m/s).
export const STOP_SPEED = 4;

// Cantieri stradali: ogni `every` metri (minimo tra due cantieri) lungo la strada, al massimo `max`; bloccano metà carreggiata.
export const CANTIERI = [
  { street: "Via dell'Indipendenza", every: 190, max: 6 },
  { street: 'Via Giacomo Matteotti', every: 300, max: 2 },
  { street: 'Via Stalingrado', every: 330, max: 4 },
  { street: 'Viale Aldo Moro', every: 400, max: 2 },
  { street: 'Via Guglielmo Marconi', every: 300, max: 2 },
];

export const VIEW = { cell: 250, loadRadius: 520, fogNear: 100, fogFar: 290 };
