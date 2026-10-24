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
    // Via Ugo Bassi, verso Piazza Malpighi: l'auto va a est verso il cliente (Nettuno) e davanti a sé ha le Due Torri.
    start: { nome: 'Via Ugo Bassi', lat: 44.495315, lon: 11.339913, facing: { lat: 44.49528, lon: 11.3405 } , look: { lat: 44.49424, lon: 11.34677, y: 40 } },
    stops: [
      { id: 'nettuno', nome: 'Fontana del Nettuno', lat: 44.494262, lon: 11.342763, raggio: 11, goal: 'Vai dal cliente al Nettuno', boarded: 'Cliente a bordo' }, // a fianco della fontana, in Piazza Maggiore
      { id: 'fiera', nome: 'Fiera di Bologna', lat: 44.5122686, lon: 11.3595329, raggio: 18, goal: 'Porta il cliente alla Fiera', boss: 'Cos', bossGoal: 'Sconfiggi Cos!' }, // alla Fiera c'è il boss finale
    ],
  },
];

// Fermarsi nel cerchio = velocità sotto questa soglia (m/s).
export const STOP_SPEED = 4;

// Cantieri stradali: ogni `every` metri (minimo tra due cantieri) lungo la strada, al massimo `max`; bloccano metà carreggiata.
export const CANTIERI = [
  { street: "Via dell'Indipendenza", every: 120, max: 10 },
  { street: 'Via Ugo Bassi', every: 150, max: 3 },
  { street: 'Via Donato Creti', every: 220, max: 3 },
  { street: 'Via Giacomo Matteotti', every: 200, max: 3 },
  { street: 'Via Stalingrado', every: 210, max: 7 },
  { street: 'Viale Aldo Moro', every: 400, max: 2 },
  { street: 'Via Guglielmo Marconi', every: 300, max: 2 },
];

export const VIEW = { cell: 250, loadRadius: 520, fogNear: 100, fogFar: 290 };

// Binari del treno Lucchio: Via Donato Creti (da ovest) poi Via Stalingrado verso la Fiera. Punti [x, z] in metri.
export const TRENO_TRACK = [[-149.3,-1207.5],[-145.0,-1206.7],[-140.1,-1205.8],[-136.4,-1205.3],[-132.7,-1204.7],[-70.8,-1192.9],[2.3,-1179.0],[15.9,-1175.5],[24.4,-1174.0],[52.5,-1168.8],[70.6,-1165.5],[99.4,-1160.1],[195.0,-1142.8],[198.6,-1142.1],[234.8,-1135.3],[268.6,-1128.9],[314.4,-1120.3],[359.6,-1111.7],[383.9,-1107.2],[394.0,-1105.2],[407.6,-1102.7],[419.8,-1100.4],[434.4,-1097.6],[458.2,-1093.2],[484.3,-1088.1],[488.6,-1087.2],[492.2,-1086.3],[495.4,-1085.5],[500.1,-1084.0],[504.9,-1082.4],[509.6,-1080.8],[518.2,-1093.1],[519.9,-1096.4],[540.8,-1154.9],[545.9,-1169.5],[547.2,-1173.0],[548.4,-1176.1],[549.9,-1180.1],[557.5,-1199.2],[579.9,-1259.4],[610.8,-1347.2],[621.1,-1376.6],[626.2,-1390.9],[627.4,-1394.3]];
