/* Named roster shared by selection, engine and artwork. */
(function (global) {
  global.KyokushinRoster = Object.freeze(Object.fromEntries(Object.entries({
  "angelo": {
    "name": "ANGELO PIERINO",
    "short": "ANGELO",
    "rank": "SENSEI · III DAN",
    "belt": "CINTURA NERA · 3 STRISCE",
    "beltColor": "black"
  },
  "samuel": {
    "name": "SAMUEL VILLANI",
    "short": "SAMUEL",
    "rank": "SENPAI · 1 KYU",
    "belt": "CINTURA MARRONE · 1 STRISCIA NERA",
    "beltColor": "brown"
  },
  "marco-tabacco-collage": {
    "name": "MARCO TABACCO",
    "short": "MARCO TABACCO",
    "rank": "KARATEKA · BODYPLANET",
    "belt": "CINTURA ARANCIONE",
    "beltColor": "orange",
    "variant": "COLLAGE",
    "assetId": "01-marco-tabacco-collage"
  },
  "gabriele-carbonaro": {
    "name": "GABRIELE CARBONARO",
    "short": "GABRIELE CARBONARO",
    "rank": "KARATEKA · BODYPLANET",
    "belt": "CINTURA GIALLA",
    "beltColor": "yellow",
    "variant": "",
    "assetId": "02-gabriele-carbonaro"
  },
  "leonardo-cappellani": {
    "name": "LEONARDO CAPPELLANI",
    "short": "LEONARDO CAPPELLANI",
    "rank": "KARATEKA · BODYPLANET",
    "belt": "CINTURA BLU · STRISCIA GIALLA",
    "beltColor": "blue-yellow",
    "variant": "",
    "assetId": "03-leonardo-cappellani"
  },
  "gabriele-randazzo": {
    "name": "GABRIELE RANDAZZO",
    "short": "GABRIELE RANDAZZO",
    "rank": "KARATEKA · BODYPLANET",
    "belt": "CINTURA ARANCIONE · STRISCIA BLU",
    "beltColor": "orange-blue",
    "variant": "",
    "assetId": "04-gabriele-randazzo"
  },
  "matteo-spata": {
    "name": "MATTEO SPATA",
    "short": "MATTEO SPATA",
    "rank": "KARATEKA · BODYPLANET",
    "belt": "CINTURA BLU",
    "beltColor": "blue",
    "variant": "",
    "assetId": "05-matteo-spata"
  },
  "oscar-gueli": {
    "name": "OSCAR GUELI",
    "short": "OSCAR GUELI",
    "rank": "KARATEKA · BODYPLANET",
    "belt": "CINTURA BLU",
    "beltColor": "blue",
    "variant": "",
    "assetId": "06-oscar-gueli"
  },
  "marco-tabacco-foto-gruppo": {
    "name": "MARCO TABACCO",
    "short": "MARCO TABACCO",
    "rank": "KARATEKA · BODYPLANET",
    "belt": "CINTURA ARANCIONE",
    "beltColor": "orange",
    "variant": "FOTO DI GRUPPO",
    "assetId": "07-marco-tabacco-foto-gruppo"
  },
  "andrea-barbagallo": {
    "name": "ANDREA BARBAGALLO",
    "short": "ANDREA BARBAGALLO",
    "rank": "KARATEKA · 9 KYU",
    "belt": "CINTURA ARANCIONE",
    "beltColor": "orange",
    "variant": "",
    "assetId": "09-andrea-barbagallo"
  },
  "andrea-vullo": {
    "name": "ANDREA VULLO",
    "short": "ANDREA VULLO",
    "rank": "KARATEKA · BODYPLANET",
    "belt": "CINTURA ARANCIONE · STRISCIA BLU",
    "beltColor": "orange-blue",
    "variant": "",
    "assetId": "08-andrea-vullo"
  }
}).map(([id, metadata]) => [id, Object.freeze(metadata)])));
})(typeof window !== "undefined" ? window : globalThis);
