// Dati di gioco: tutto ciò che è "contenuto" sta qui, così aggiungere punti cliente = aggiungere una riga.
export const DATA_URLS = {
  roads: 'data/roads.json',
  buildings: 'data/buildings.json',
  areas: 'data/areas.json',
  labels: 'data/labels.json',
  extras: 'data/extras.json',
};

// Corse: partenza + elenco di tappe (la prima è il cliente, l'ultima la destinazione). `raggio` = raggio del cerchio in metri;
// per completare una tappa ci si ferma nel cerchio. Punti agganciati alla strada più vicina.
// Aggiungere una corsa = aggiungere un oggetto (es. Centro di Raccolta Hera, IIS Aldini Valeriani in Via Sario Bassanelli / Via di Corticella).
export const RIDES = [
  {
    id: 'torri-fiera',
    start: { nome: 'Due Torri', lat: 44.494244, lon: 11.34657, facing: { lat: 44.493795, lon: 11.345839 } }, // sotto le torri, verso Piazza Maggiore
    stops: [
      { id: 'piazza-maggiore', nome: 'Piazza Maggiore', lat: 44.4936561, lon: 11.3430486, raggio: 22, goal: 'Vai dal cliente', boarded: 'Cliente a bordo' },
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

export const VIEW = { cell: 250, loadRadius: 520, fogNear: 110, fogFar: 330 };
