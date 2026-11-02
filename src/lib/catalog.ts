// Catalog data — all titles are public domain or Creative Commons licensed films
// streamed from the Internet Archive (verified sources).
// All synopses are original descriptions written for this project.

export type Episode = {
  id: string;
  title: string;
  season: number;
  episode: number;
  /** archive.org item identifier */
  iaId: string;
  /** file path inside the item (may include a subfolder) */
  iaFile: string;
  runtime: number; // minutes
  synopsis: string;
};

export type Title = {
  id: string;
  slug: string;
  name: string;
  year: number;
  kind: "movie" | "show" | "anime";
  type: "Movie" | "TV Series" | "Anime" | "Animation";
  genres: string[];
  language: string;
  country: string;
  rating: number; // 0-10
  runtime: number; // minutes (for movies) or avg episode length
  poster: string;
  backdrop?: string;
  tagline: string;
  synopsis: string;
  director: string;
  cast: string[];
  /** matched quality labels derived from source */
  quality: string[];
  accent: string; // hex used for gradients/fallback
  iaId: string;
  iaFile: string;
  episodes?: Episode[];
};

export const GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Drama",
  "Family",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Thriller",
] as const;

export const LANGUAGES = [
  "English",
  "Silent",
  "Japanese",
] as const;

const P = (slug: string) => `/posters/${slug}.png`;
const B = (slug: string) => `/backdrops/${slug}.png`;

export const CATALOG: Title[] = [
  // ------------------------- MOVIES -------------------------
  {
    id: "t-notld",
    slug: "night-of-the-living-dead",
    name: "Night of the Living Dead",
    year: 1968,
    kind: "movie",
    type: "Movie",
    genres: ["Horror", "Thriller"],
    language: "English",
    country: "United States",
    rating: 7.9,
    runtime: 96,
    poster: P("night-of-the-living-dead"),
    backdrop: B("night-of-the-living-dead-wide"),
    tagline: "They won't stay dead.",
    synopsis:
      "Seven strangers barricade themselves inside a rural Pennsylvania farmhouse as the recently dead rise and attack the living. As radio reports fray and the barricades strain, the real horror turns out to be the people inside, whose fear and suspicion prove as dangerous as what shambles outside. George A. Romero's black-and-white landmark invented the modern zombie film and still hits with savage, documentary-like force.",
    director: "George A. Romero",
    cast: ["Duane Jones", "Judith O'Dea", "Karl Hardman", "Marilyn Eastman"],
    quality: ["HD", "CC"],
    accent: "#5f7d54",
    iaId: "night-of-the-living-dead-1968-hd",
    iaFile: "Night Of The Living Dead (1968) [HD].mp4",
  },
  {
    id: "t-metropolis",
    slug: "metropolis",
    name: "Metropolis",
    year: 1927,
    kind: "movie",
    type: "Movie",
    genres: ["Sci-Fi", "Drama"],
    language: "Silent",
    country: "Germany",
    rating: 8.3,
    runtime: 148,
    poster: P("metropolis"),
    backdrop: B("metropolis-wide"),
    tagline: "The fate of civilization rests in their hands.",
    synopsis:
      "In a towering future city, the pampered son of the ruler discovers an underground world of workers who keep the machines alive. Fritz Lang's silent epic fuses art-deco spectacle with a story of class division, machine worship and mediation between the head and the hands. Its robot double, skyscraper skylines and mass choreography remain among the most influential images in all of science fiction.",
    director: "Fritz Lang",
    cast: ["Brigitte Helm", "Gustav Fröhlich", "Alfred Abel", "Rudolf Klein-Rogge"],
    quality: ["4K", "Restored"],
    accent: "#c8a24a",
    iaId: "metropolis-1927-full-movie-4-k-color-remastered-2023-colorized-with-gottfried-huppertz-score",
    iaFile: "Metropolis (1927) Full Movie _ 4K Color Remastered_ 2023 Colorized with Gottfried Huppertz Score.mp4",
  },
  {
    id: "t-nosferatu",
    slug: "nosferatu",
    name: "Nosferatu",
    year: 1922,
    kind: "movie",
    type: "Movie",
    genres: ["Horror", "Fantasy"],
    language: "Silent",
    country: "Germany",
    rating: 7.9,
    runtime: 94,
    poster: P("nosferatu"),
    tagline: "A symphony of horror.",
    synopsis:
      "An estate agent travels to the Carpathian mountains to close a property sale with a reclusive count, and carries a plague back home with him. F. W. Murnau's unofficial retelling of Dracula trades aristocratic charm for pure pestilence: Max Schreck's rat-toothed predator stalks expressionist shadows toward one of cinema's most chilling final images. The blueprint for every vampire film that followed.",
    director: "F. W. Murnau",
    cast: ["Max Schreck", "Gustav von Wangenheim", "Greta Schröder"],
    quality: ["Restored"],
    accent: "#5d7a58",
    iaId: "nosferatu-1922",
    iaFile: "Nosferatu (1922).mp4",
  },
  {
    id: "t-caligari",
    slug: "the-cabinet-of-dr-caligari",
    name: "The Cabinet of Dr. Caligari",
    year: 1920,
    kind: "movie",
    type: "Movie",
    genres: ["Horror", "Mystery"],
    language: "Silent",
    country: "Germany",
    rating: 8.0,
    runtime: 77,
    poster: P("the-cabinet-of-dr-caligari"),
    tagline: "You must become Caligari.",
    synopsis:
      "A fairground hypnotist and his sleepwalking sideshow act arrive in a town where murders begin at night. Told through crooked painted sets, spliced windows and oblique stairways, the story folds into an unreliable narration that helped invent the psychological twist ending. The single most recognizable visual style of German expressionism, and still a vertigo-inducing watch a century later.",
    director: "Robert Wiene",
    cast: ["Werner Krauss", "Conrad Veidt", "Friedrich Fehér"],
    quality: ["Restored"],
    accent: "#7a9e7e",
    iaId: "the-cabinet-of-dr-caligari",
    iaFile: "The Cabinet Of Dr Caligari.mp4",
  },
  {
    id: "t-sherlock-jr",
    slug: "sherlock-jr",
    name: "Sherlock Jr.",
    year: 1924,
    kind: "movie",
    type: "Movie",
    genres: ["Comedy", "Action"],
    language: "Silent",
    country: "United States",
    rating: 8.2,
    runtime: 45,
    poster: P("sherlock-jr"),
    tagline: "The greatest detective in motion pictures… almost.",
    synopsis:
      "A daydreaming film projectionist, framed for a theft he didn't commit, falls asleep in the booth and walks straight into the movie he is screening. Buster Keaton's shorts-length masterpiece turns cinema itself into a playground: he steps through edits, rides motorcycles over collapsing bridges and executes stunts that remain jaw-dropping a century on. Brief, breezy and absolutely essential.",
    director: "Buster Keaton",
    cast: ["Buster Keaton", "Kathryn McGuire", "Joe Keaton"],
    quality: ["Restored"],
    accent: "#b09a6a",
    iaId: "sherlock-jr_202506",
    iaFile: "Sherlock Jr.mp4",
  },
  {
    id: "t-the-kid",
    slug: "the-kid",
    name: "The Kid",
    year: 1921,
    kind: "movie",
    type: "Movie",
    genres: ["Comedy", "Drama", "Family"],
    language: "Silent",
    country: "United States",
    rating: 8.2,
    runtime: 68,
    poster: P("the-kid"),
    tagline: "A picture with a smile — and perhaps, a tear.",
    synopsis:
      "A drifting tramp raises an abandoned child as his own, and the two scamper through the city as an inseparable team of small hustlers. Chaplin's first feature balances slapstick with genuine heart, building to a rooftop chase and a reunion that still lands. The film that proved the Little Tramp could carry a full-length story without losing an ounce of charm.",
    director: "Charles Chaplin",
    cast: ["Charles Chaplin", "Jackie Coogan", "Edna Purviance"],
    quality: ["Restored"],
    accent: "#b08d5a",
    iaId: "the-kid-1921_202609",
    iaFile: "The Kid 1921.mp4",
  },
  {
    id: "t-the-general",
    slug: "the-general",
    name: "The General",
    year: 1926,
    kind: "movie",
    type: "Movie",
    genres: ["Comedy", "Action", "Adventure"],
    language: "Silent",
    country: "United States",
    rating: 8.1,
    runtime: 79,
    poster: P("the-general"),
    tagline: "He stole his girl, his engine — and the show.",
    synopsis:
      "A railway engineer rejected by the army chases his stolen locomotive — and his sweetheart — straight through enemy lines. Built around real trains, collapsing bridges and Keaton's deadpan nerve, the film is one long, escalating action sequence engineered with comic precision. Widely called the greatest silent comedy ever made, and arguably the first great action movie.",
    director: "Buster Keaton",
    cast: ["Buster Keaton", "Marion Mack", "Glen Cavender"],
    quality: ["HD"],
    accent: "#8a6f4d",
    iaId: "TheGeneral1926",
    iaFile: "The_General_1926_720p_512kb.mp4",
  },
  {
    id: "t-his-girl-friday",
    slug: "his-girl-friday",
    name: "His Girl Friday",
    year: 1940,
    kind: "movie",
    type: "Movie",
    genres: ["Comedy", "Romance", "Drama"],
    language: "English",
    country: "United States",
    rating: 7.9,
    runtime: 92,
    poster: P("his-girl-friday"),
    tagline: "Nobody talks faster than a newspaperman on a deadline.",
    synopsis:
      "A newspaper editor will do anything — lie, stall, kidnap — to keep his star reporter and ex-wife from quitting the paper and remarrying. Hawks' newsroom classic overlaps dialogue like a woodwind ensemble, letting Cary Grant and Rosalind Russell talk rings around everyone in the building. The fastest screwball comedy of Hollywood's golden age, and still the gold standard for banter.",
    director: "Howard Hawks",
    cast: ["Cary Grant", "Rosalind Russell", "Ralph Bellamy"],
    quality: ["HD"],
    accent: "#b34a3e",
    iaId: "his_girl_friday",
    iaFile: "his_girl_friday_512kb.mp4",
  },
  {
    id: "t-charade",
    slug: "charade",
    name: "Charade",
    year: 1963,
    kind: "movie",
    type: "Movie",
    genres: ["Mystery", "Romance", "Thriller"],
    language: "English",
    country: "United States",
    rating: 7.8,
    runtime: 113,
    poster: P("charade"),
    backdrop: B("charade-wide"),
    tagline: "The game is dangerous. The prize is deadly.",
    synopsis:
      "A young widow in Paris learns her late husband's fortune is missing, and that every charming stranger circling her may be a murderer wearing a different name. Cary Grant charms, Audrey Hepburn glides, and the plot reshuffles its suspects with each scene like a card sharp. Often called the best Hitchcock film Hitchcock never made — with a Mancini score to die for.",
    director: "Stanley Donen",
    cast: ["Cary Grant", "Audrey Hepburn", "Walter Matthau"],
    quality: ["HD"],
    accent: "#c96a6e",
    iaId: "charade-1963-cary-grant-audrey-hepburn-comedy-mystery-romance-thriller-full-movie",
    iaFile: "Charade_READY.mp4",
  },
  {
    id: "t-plan-9",
    slug: "plan-9-from-outer-space",
    name: "Plan 9 from Outer Space",
    year: 1957,
    kind: "movie",
    type: "Movie",
    genres: ["Sci-Fi", "Horror"],
    language: "English",
    country: "United States",
    rating: 4.2,
    runtime: 79,
    poster: P("plan-9-from-outer-space"),
    tagline: "Gloriously, unmissably bad.",
    synopsis:
      "Aliens resurrect the town cemetery in their ninth attempt to conquer Earth, and flying saucers made of paper plates patrol the skies. Ed Wood's masterpiece of ineptitude — wobbly tombstones, incoherent stock footage, a leading man's role played by a chiropractor — has earned its crown as the most lovable bad movie ever made. Bring friends; it's better that way.",
    director: "Ed Wood",
    cast: ["Béla Lugosi", "Tor Johnson", "Vampira"],
    quality: ["HD", "So Bad It's Good"],
    accent: "#5a7d7a",
    iaId: "plan-9-from-outer-space-1957-by-ed-wood",
    iaFile: "Plan.9.From.Outer.Space.1957.1080p.BluRay.x264.AAC-[YTS.MX].mp4",
  },
  {
    id: "t-little-shop",
    slug: "the-little-shop-of-horrors",
    name: "The Little Shop of Horrors",
    year: 1960,
    kind: "movie",
    type: "Movie",
    genres: ["Comedy", "Horror"],
    language: "English",
    country: "United States",
    rating: 6.3,
    runtime: 72,
    poster: P("the-little-shop-of-horrors"),
    tagline: "Feed me!",
    synopsis:
      "A hapless flower-shop clerk breeds a talking plant with an appetite that gets progressively less botanical. Roger Corman shot the entire cult comedy in two days on standing sets, and its gallery of weirdos — including a young Jack Nicholson in a milk-drinking cameo — has kept midnight audiences howling for decades. Cheap, quick and absolutely alive.",
    director: "Roger Corman",
    cast: ["Jonathan Haze", "Jackie Joseph", "Jack Nicholson"],
    quality: ["HD"],
    accent: "#6d8f4e",
    iaId: "TheLittleShopOfHorrors",
    iaFile: "The Little Shop of Horrors.mp4",
  },
  {
    id: "t-gulliver",
    slug: "gullivers-travels",
    name: "Gulliver's Travels",
    year: 1939,
    kind: "movie",
    type: "Movie",
    genres: ["Animation", "Family", "Adventure", "Fantasy"],
    language: "English",
    country: "United States",
    rating: 6.5,
    runtime: 76,
    poster: P("gullivers-travels"),
    tagline: "A giant among cartoons.",
    synopsis:
      "A shipwrecked sailor wakes on the shore of Lilliput, where two kingdoms are ready to go to war over which wedding song the princess should marry to. The Fleischer Studios answer to Disney swings for the fences with rotoscoped giants, swing-era songs and dazzling model-made storms. The first full-length cartoon to challenge the Mouse at the box office.",
    director: "Dave Fleischer",
    cast: ["Jessica Dragonette", "Lanny Ross", "Pinto Colvig"],
    quality: ["Restored"],
    accent: "#4e8f6d",
    iaId: "gullivers-travels-1939-fleischer",
    iaFile: "Gulliver's Travels (1939).mp4",
  },
  // ------------------------- ANIMATION (open movies + classic cartoons) -------------------------
  {
    id: "t-bbb",
    slug: "big-buck-bunny",
    name: "Big Buck Bunny",
    year: 2008,
    kind: "movie",
    type: "Animation",
    genres: ["Animation", "Comedy", "Family"],
    language: "Silent",
    country: "Netherlands",
    rating: 7.4,
    runtime: 10,
    poster: P("big-buck-bunny"),
    backdrop: B("big-buck-bunny-wide"),
    tagline: "Don't bully the bunny.",
    synopsis:
      "A gentle giant rabbit has his idyllic morning ruined by three cruel rodents, and responds with elaborately poetic payback. The Blender Institute's first open movie put a professional-grade animation pipeline in everyone's hands — every frame is free to remix. Ten minutes of sunshine, slapstick and perfectly timed cartoon karma.",
    director: "Sacha Goedegebure",
    cast: ["Blender Foundation Team"],
    quality: ["HD", "CC-BY"],
    accent: "#5f9e57",
    iaId: "big-buck-bunny-720p-h264_202403",
    iaFile: "big buck bunny 720p h264.mp4",
  },
  {
    id: "t-sintel",
    slug: "sintel",
    name: "Sintel",
    year: 2010,
    kind: "movie",
    type: "Animation",
    genres: ["Animation", "Fantasy", "Adventure", "Drama"],
    language: "Silent",
    country: "Netherlands",
    rating: 7.6,
    runtime: 15,
    poster: P("sintel"),
    backdrop: B("sintel-wide"),
    tagline: "A quest across a lifetime.",
    synopsis:
      "A lonely wanderer nurses an injured dragon hatchling back to health, only to have it stolen from her — so begins a journey that consumes her youth. The Blender Foundation's third open movie packs an entire epic trilogy of heartbreak into a quarter of an hour, ending on a note most features wouldn't dare. Gorgeous, wordless-scale fantasy filmmaking.",
    director: "Colin Levy",
    cast: ["Halina Reijn", "Thom Hoffman"],
    quality: ["HD", "CC-BY"],
    accent: "#3f7d8c",
    iaId: "sintel_202207",
    iaFile: "data/sintel.mp4",
  },
  {
    id: "t-elephants-dream",
    slug: "elephants-dream",
    name: "Elephants Dream",
    year: 2006,
    kind: "movie",
    type: "Animation",
    genres: ["Animation", "Sci-Fi", "Fantasy"],
    language: "Silent",
    country: "Netherlands",
    rating: 6.9,
    runtime: 11,
    poster: P("elephants-dream"),
    tagline: "Two men, one machine, a thousand doors.",
    synopsis:
      "Two explorers wander a vast living machine of corridors, pipes and doors that rewrites itself around them — one sees wonder, the other sees menace. The world's first open movie is equal parts art installation and riddle, dreamt up by the Blender community. A dense, dreamlike eleven minutes that rewards a second watch immediately.",
    director: "Bassam Kurdali",
    cast: ["Tygo Gernandt", "Cas Jansen"],
    quality: ["HD", "CC-BY"],
    accent: "#4a7d8a",
    iaId: "elephants-dream",
    iaFile: "ElephantsDream.mp4",
  },
  {
    id: "t-tears-of-steel",
    slug: "tears-of-steel",
    name: "Tears of Steel",
    year: 2012,
    kind: "movie",
    type: "Animation",
    genres: ["Animation", "Sci-Fi", "Thriller"],
    language: "English",
    country: "Netherlands",
    rating: 6.6,
    runtime: 12,
    poster: P("tears-of-steel"),
    tagline: "The future needs a second chance.",
    synopsis:
      "In a robot-ravaged future Amsterdam, a team of scientists recreates a decades-old lovers' quarrel hoping to prevent the machine uprising. The Blender Foundation's live-action/VFX hybrid turns a breakup into an apocalypse, staged on real locations with open-source visual effects. A short, sharp experiment in do-it-yourself blockbuster craft.",
    director: "Ian Hubert",
    cast: ["Derek de Lint", "Sergio Hasselbaink", "Rogier Schippers"],
    quality: ["HD", "CC-BY"],
    accent: "#5a6f8c",
    iaId: "Tears-of-Steel",
    iaFile: "tears_of_steel_720p.mp4",
  },
  {
    id: "t-cosmos-laundromat",
    slug: "cosmos-laundromat",
    name: "Cosmos Laundromat: First Cycle",
    year: 2015,
    kind: "movie",
    type: "Animation",
    genres: ["Animation", "Comedy", "Fantasy"],
    language: "Silent",
    country: "Netherlands",
    rating: 7.1,
    runtime: 12,
    poster: P("cosmos-laundromat"),
    tagline: "Wish you were dead? Wish again.",
    synopsis:
      "A suicidal sheep on a desolate island is talked out of ending it all by a strange salesman who offers him unlimited lives. Blender's wildest open movie pitches existential comedy and psychedelic shape-shifting against gorgeous windswept coastlines. The first chapter of an ambitious anthology — and a hell of a sales pitch.",
    director: "Mathieu Auvray",
    cast: ["Pierre Bokma", "Reinout Scholten van Aschat"],
    quality: ["HD", "CC-BY"],
    accent: "#c98a4a",
    iaId: "cosmos-laundromat-first-cycle",
    iaFile: "Cosmos Laundromat - First Cycle.mp4",
  },
  {
    id: "t-caminandes",
    slug: "caminandes-llamigos",
    name: "Caminandes 3: Llamigos",
    year: 2016,
    kind: "movie",
    type: "Animation",
    genres: ["Animation", "Comedy", "Family"],
    language: "Silent",
    country: "Netherlands",
    rating: 7.2,
    runtime: 3,
    poster: P("caminandes-llamigos"),
    tagline: "Llama vs. penguin: the frost awakens.",
    synopsis:
      "A dim-witted llama and a scheming penguin face off across a snowy Patagonian road for supremacy over the last berry bush. The third Caminandes short is a two-and-a-half-minute masterclass in cartoon timing, told entirely without words. Winter has never been this adorable.",
    director: "Pablo Vazquez",
    cast: ["Blender Foundation Team"],
    quality: ["HD", "CC-BY"],
    accent: "#7aa8c9",
    iaId: "caminandes-3-llamigos",
    iaFile: "2_Caminandes3_Llamigos_1080p_vp9.ogv",
  },
  {
    id: "t-superman-mechanical",
    slug: "superman-mechanical-monsters",
    name: "Superman: The Mechanical Monsters",
    year: 1941,
    kind: "movie",
    type: "Animation",
    genres: ["Animation", "Action", "Sci-Fi", "Adventure"],
    language: "English",
    country: "United States",
    rating: 7.6,
    runtime: 10,
    poster: P("superman-mechanical-monsters"),
    tagline: "Up in the sky — the first superhero animation.",
    synopsis:
      "A gang of towering robots robs banks and jewelry stores under orders from a masked inventor plotting to fly his armada against the city. The second Fleischer Superman cartoon defined how the Man of Steel flies, lands and poses for the next eighty years. Every superhero movie owes these ten minutes a debt.",
    director: "Dave Fleischer",
    cast: ["Bud Collyer", "Joan Alexander"],
    quality: ["Restored"],
    accent: "#b3402e",
    iaId: "Superman2.TheMechanicalMonsters",
    iaFile: "MaxFleischerWithSupermanNo.2TheMechanicalMonsters.mp4NqNovioquality-Youtube.mp4",
  },
  {
    id: "t-betty-snow-white",
    slug: "betty-boop-snow-white",
    name: "Betty Boop in Snow-White",
    year: 1933,
    kind: "movie",
    type: "Animation",
    genres: ["Animation", "Fantasy", "Music"],
    language: "English",
    country: "United States",
    rating: 7.3,
    runtime: 8,
    poster: P("betty-boop-snow-white"),
    tagline: "Jazz, rotoscope and a very cruel queen.",
    synopsis:
      "Betty Boop flees a jealous queen into a surreal forest where trees and candles dance to Cab Calloway's wailing 'St. James Infirmary'. The Fleischer rotoscope bend reality in ways no modern cartoon dares, turning a fairy tale into a haunted jazz number. One of the strangest and greatest animated shorts ever produced.",
    director: "Dave Fleischer",
    cast: ["Mae Questel", "Cab Calloway"],
    quality: ["Restored"],
    accent: "#8c4a5f",
    iaId: "BettyBoopInSnowWhite",
    iaFile: "bb_snow_white-1.mp4",
  },
  {
    id: "t-popeye-paneless",
    slug: "popeye-the-paneless-window-washer",
    name: "Popeye the Sailor: The Paneless Window Washer",
    year: 1937,
    kind: "movie",
    type: "Animation",
    genres: ["Animation", "Comedy", "Family"],
    language: "English",
    country: "United States",
    rating: 7.0,
    runtime: 7,
    poster: P("popeye-the-paneless-window-washer"),
    tagline: "High-rise rivalry, skyscraper scale.",
    synopsis:
      "Popeye and Bluto compete to wash the windows of a skyscraper office while Olive works inside, and the building becomes a battlefield of suds, ladders and hydraulics. Classic rubber-hose escalation with gravity-defying gags in every frame. Spinach is, of course, involved.",
    director: "Dave Fleischer",
    cast: ["Jack Mercer", "Mae Questel", "Gus Wickie"],
    quality: ["Restored"],
    accent: "#c9803e",
    iaId: "Popeye_ThePanelessWindowWasher",
    iaFile: "Popeye_ThePanelessWindowWasher_512kb.mp4",
  },
  // ------------------------- ANIME -------------------------
  {
    id: "t-dull-sword",
    slug: "the-dull-sword",
    name: "The Dull Sword (Namakura Gatana)",
    year: 1917,
    kind: "anime",
    type: "Anime",
    genres: ["Animation", "Comedy", "Action"],
    language: "Japanese",
    country: "Japan",
    rating: 6.9,
    runtime: 4,
    poster: P("the-dull-sword"),
    tagline: "The oldest anime you can still watch.",
    synopsis:
      "A dim-witted samurai buys a bargain blade and learns the hard way that being outspent in the sword shop has consequences. This hand-drawn short from 1917 is among the earliest surviving Japanese animations — a small silent comedy that treats swordplay like vaudeville. A genuine national treasure, rediscovered in an antique shop in 2007.",
    director: "Jun'ichi Kōuchi",
    cast: ["Silent cast"],
    quality: ["Restored", "Historic"],
    accent: "#9c7c50",
    iaId: "1917-the-dull-sword-namakura-gatana",
    iaFile: "1917： The Dull Sword - Namakura Gatana.mp4",
  },
  {
    id: "t-momotaro-sea-eagles",
    slug: "momotaros-sea-eagles",
    name: "Momotaro's Sea Eagles",
    year: 1943,
    kind: "anime",
    type: "Anime",
    genres: ["Animation", "Action", "Adventure"],
    language: "Japanese",
    country: "Japan",
    rating: 5.9,
    runtime: 37,
    poster: P("momotaros-sea-eagles"),
    tagline: "The first feature-length anime.",
    synopsis:
      "Peach Boy leads a squadron of animal pilots on a daring aerial raid across the sea, with monkeys, dogs and pheasants manning the bombers. This 1943 naval fantasy is the earliest surviving feature-length piece of Japanese animation — a milestone you watch for its place in history, with cartoon gags and gravity-defying slapstick layered over wartime spectacle. A fascinating, troubling, indispensable artifact.",
    director: "Mitsuyo Seo",
    cast: ["Silent cast"],
    quality: ["Restored", "Historic"],
    accent: "#b3504a",
    iaId: "momotaro-no-umiwashi-1943",
    iaFile: "Momotaro no umiwashi (1943).mp4",
  },
  {
    id: "t-fox-and-tanuki",
    slug: "fox-and-tanuki",
    name: "Fox and Tanuki's Trick Competition",
    year: 1933,
    kind: "anime",
    type: "Anime",
    genres: ["Animation", "Fantasy", "Comedy"],
    language: "Japanese",
    country: "Japan",
    rating: 6.5,
    runtime: 11,
    poster: P("fox-and-tanuki"),
    tagline: "Shape-shifting spirits, escalating chaos.",
    synopsis:
      "A fox and a tanuki wage a duel of increasingly absurd illusions — lanterns, teapots, monsters and fireworks — that transforms a temple into pandemonium. Ōfuji Noburō's paper-cutout magic predates every animation festival award named after him. Japanese folklore rendered in gloriously inventive silhouette.",
    director: "Noburō Ōfuji",
    cast: ["Silent cast"],
    quality: ["Restored", "Historic"],
    accent: "#8a5f9e",
    iaId: "ugokie-kori-no-tatehiki-1933",
    iaFile: "Ugokie kori no tatehiki (1933).mp4",
  },
  {
    id: "t-benkei-ushiwaka",
    slug: "benkei-vs-ushiwaka",
    name: "Benkei vs Ushiwaka",
    year: 1939,
    kind: "anime",
    type: "Anime",
    genres: ["Animation", "Action", "Drama"],
    language: "Japanese",
    country: "Japan",
    rating: 6.4,
    runtime: 13,
    poster: P("benkei-vs-ushiwaka"),
    tagline: "The duel on Gojō Bridge, animated.",
    synopsis:
      "On a moonlit Kyoto bridge, a hulking warrior monk collects swords from every man he defeats — until a swift young nobleman turns the tables. Kenzō Masaoka's take on Japan's most famous legend brings fluid, rotoscope-adjacent movement to 1930s animation. A bedtime-story duel staged like an action picture.",
    director: "Kenzō Masaoka",
    cast: ["Silent cast"],
    quality: ["Restored", "Historic"],
    accent: "#5f6d9e",
    iaId: "benkei-tai-ushiwaka-1939",
    iaFile: "Benkei tai Ushiwaka (1939).mp4",
  },
  // ------------------------- TV SHOWS -------------------------
  {
    id: "t-sherlock-holmes",
    slug: "the-adventures-of-sherlock-holmes",
    name: "The Adventures of Sherlock Holmes",
    year: 1954,
    kind: "show",
    type: "TV Series",
    genres: ["Mystery", "Thriller", "Drama"],
    language: "English",
    country: "United States",
    rating: 7.6,
    runtime: 26,
    poster: P("sherlock-holmes-1954"),
    tagline: "The world's greatest detective, in the only TV series shot in France.",
    synopsis:
      "Ronald Howard's warm, quick-witted Holmes and Howard Marion-Crawford's Watson solve locked rooms, disguised thieves and midnight blackmailers across 1950s Europe. The lone screen Holmes produced in France, it plays the canon straight with brisk half-hour mysteries and fog-drenched atmosphere. Every episode streams freely — the whole series fell into the public domain.",
    director: "Steve Previn",
    cast: ["Ronald Howard", "H. Marion Crawford", "Archie Duncan"],
    quality: ["HD"],
    accent: "#8a7d5a",
    iaId: "SherlockHolmes-TheCaseofLadyBeryl",
    iaFile: "TheCaseofLadyBeryl_512kb.mp4",
    episodes: [
      {
        id: "e-sh-1",
        title: "The Case of the Cunningham Heritage",
        season: 1,
        episode: 1,
        iaId: "1954SHERLOCKHOLMESEP1",
        iaFile: "1954__SHERLOCK_HOLMES_EP_1.mp4",
        runtime: 26,
        synopsis:
          "A bridegroom found dead behind a locked door, a torn wedding dress and a missing pearl draw Holmes into his first case of the series.",
      },
      {
        id: "e-sh-2",
        title: "The Case of Lady Beryl",
        season: 1,
        episode: 2,
        iaId: "SherlockHolmes-TheCaseofLadyBeryl",
        iaFile: "TheCaseofLadyBeryl_512kb.mp4",
        runtime: 26,
        synopsis:
          "A society lady confesses to murder to protect someone she loves, but the apartment's layout tells Holmes a very different story.",
      },
      {
        id: "e-sh-3",
        title: "The Case of the Texas Cowgirl",
        season: 1,
        episode: 3,
        iaId: "4.-the-case-of-the-texas-cowgirl",
        iaFile: "4. The Case of the Texas Cowgirl.mp4",
        runtime: 26,
        synopsis:
          "An American rodeo rider flees a hotel room where a body lies under the bed, and Holmes must outrun the police to untangle the truth.",
      },
      {
        id: "e-sh-4",
        title: "The Reluctant Carpenter",
        season: 1,
        episode: 4,
        iaId: "the-adventures-of-sherlock-holmes-s-03-e-01-reluctant-carpenter",
        iaFile: "The Adventures of Sherlock Holmes_S03E01_Reluctant Carpenter.mp4",
        runtime: 26,
        synopsis:
          "A stranger hires a carpenter for one night's work and refuses to leave; by morning, someone is dead and the carpenter can't explain why.",
      },
    ],
  },
  {
    id: "t-one-step-beyond",
    slug: "one-step-beyond",
    name: "One Step Beyond",
    year: 1959,
    kind: "show",
    type: "TV Series",
    genres: ["Mystery", "Thriller", "Fantasy"],
    language: "English",
    country: "United States",
    rating: 7.4,
    runtime: 26,
    poster: P("one-step-beyond"),
    tagline: "True stories of the supernatural… allegedly.",
    synopsis:
      "Hosted by John Newland and billed as dramatizations of documented paranormal events, this anthology series walks the line between The Twilight Zone and a séance. Fog, whispering narration and endings that refuse comfort made it the creepier cousin of television's golden-age anthologies. Most episodes claim a 'true' basis — decide for yourself.",
    director: "John Newland",
    cast: ["John Newland", "Various guests"],
    quality: ["HD"],
    accent: "#7a6a9e",
    iaId: "OneStepBeyondTheInheritance",
    iaFile: "One Step Beyond - The Inheritance.mp4",
    episodes: [
      {
        id: "e-osb-1",
        title: "Echo",
        season: 1,
        episode: 20,
        iaId: "S1E20Echo",
        iaFile: "S1E20 - Echo.mp4",
        runtime: 26,
        synopsis:
          "A woman begins receiving radio broadcasts through her dental fillings, and the voice knows things it shouldn't.",
      },
      {
        id: "e-osb-2",
        title: "The Inheritance",
        season: 1,
        episode: 1,
        iaId: "OneStepBeyondTheInheritance",
        iaFile: "One Step Beyond - The Inheritance.mp4",
        runtime: 26,
        synopsis:
          "A man inherits a house he has never seen and a family he cannot remember — the walls remember for him.",
      },
      {
        id: "e-osb-3",
        title: "The Storm",
        season: 2,
        episode: 5,
        iaId: "OneStepBeyondTheStorm",
        iaFile: "OneStepBeyond-TheStorm-Youtube.mp4",
        runtime: 26,
        synopsis:
          "Two fishermen read the sea's mood the same way their dead father did — and the horizon says something terrible is coming.",
      },
      {
        id: "e-osb-4",
        title: "Tidal Wave",
        season: 3,
        episode: 1,
        iaId: "S3E1TIDALWAVE",
        iaFile: "S3E1 - TIDAL WAVE.mp4",
        runtime: 26,
        synopsis:
          "A recurring nightmare of a drowning city begins matching the news, hour by hour, in the series' most ambitious disaster episode.",
      },
    ],
  },
  {
    id: "t-lucy-show",
    slug: "the-lucy-show",
    name: "The Lucy Show",
    year: 1962,
    kind: "show",
    type: "TV Series",
    genres: ["Comedy", "Family"],
    language: "English",
    country: "United States",
    rating: 7.5,
    runtime: 26,
    poster: P("the-lucy-show"),
    tagline: "Lucille Ball, still the physical comedy champion.",
    synopsis:
      "Lucy Carmichael juggles kids, jobs and catastrophes with her best friend Viv — and whenever a scheme needs sabotaging, Lucy is first in line. Following I Love Lucy, Lucille Ball proved her balletic gift for disaster translate to any decade, from department-store mob scenes to celebrity run-ins. Later episodes aired live to glowing reviews and remain in the public domain today.",
    director: "Jack Donohue",
    cast: ["Lucille Ball", "Vivian Vance", "Gale Gordon"],
    quality: ["HD"],
    accent: "#c96a3e",
    iaId: "TheLucyShow5x0191266LucyAndGeorgeBurns",
    iaFile: "TheLucyShow_5x01_9-12-66_LucyandGeorgeBurns.mp4",
    episodes: [
      {
        id: "e-lucy-1",
        title: "Lucy and George Burns",
        season: 5,
        episode: 1,
        iaId: "TheLucyShow5x0191266LucyAndGeorgeBurns",
        iaFile: "TheLucyShow_5x01_9-12-66_LucyandGeorgeBurns.mp4",
        runtime: 26,
        synopsis:
          "Season five kicks off with George Burns offering Lucy a job — provided she can keep one secret from herself for a whole day.",
      },
      {
        id: "e-lucy-2",
        title: "Lucy Meets Mel Torme",
        season: 3,
        episode: 3,
        iaId: "Lucy_Show_Main_Street",
        iaFile: "Lucy_MelTorme_512kb.mp4",
        runtime: 26,
        synopsis:
          "Lucy schemes her way into a musical number with Mel Torme, and the Velvet Fog learns what a hurricane in a sequined dress sounds like.",
      },
      {
        id: "e-lucy-3",
        title: "Lucy Gets Jack Benny's Account",
        season: 3,
        episode: 4,
        iaId: "TheLucyShow-LucyGetsJackBennysAccount",
        iaFile: "thelucyshow_lucygetsjackbennysaccount.mp4",
        runtime: 26,
        synopsis:
          "Bank teller Lucy lands the branch's richest customer — Jack Benny — and his legendary stinginess goes to war with her legendary clumsiness.",
      },
      {
        id: "e-lucy-4",
        title: "Little Old Lucy",
        season: 6,
        episode: 5,
        iaId: "TheLucyShowLittleOldLucy",
        iaFile: "The Lucy Show - Little Old Lucy.mp4",
        runtime: 26,
        synopsis:
          "Disguised as a sweet elderly lady to teach a con artist a lesson, Lucy discovers nobody underestimates a granny like her.",
      },
    ],
  },
  {
    id: "t-burns-allen",
    slug: "the-george-burns-and-gracie-allen-show",
    name: "The George Burns and Gracie Allen Show",
    year: 1950,
    kind: "show",
    type: "TV Series",
    genres: ["Comedy", "Family"],
    language: "English",
    country: "United States",
    rating: 7.6,
    runtime: 26,
    poster: P("burns-and-allen"),
    tagline: "The original fourth-wall breaker.",
    synopsis:
      "George plays straight man to his real-life wife's glorious illogic, breaking the fourth wall to comment on the chaos Gracie creates in their own living room. Gracie Allen's 'illogical logic' — answering every question with impeccable wrongness — remains one of the sharpest comic engines ever built. television's first great meta-sitcom, freely streamable in the public domain.",
    director: "Frederick de Cordova",
    cast: ["George Burns", "Gracie Allen", "Bea Benaderet"],
    quality: ["HD"],
    accent: "#b3824a",
    iaId: "TheGeorgeBurnsAndGracieAllenShow-NewCoatssitcom1950s",
    iaFile: "BurnsAllenCoats_512kb.mp4",
    episodes: [
      {
        id: "e-ba-1",
        title: "New Coats",
        season: 1,
        episode: 1,
        iaId: "TheGeorgeBurnsAndGracieAllenShow-NewCoatssitcom1950s",
        iaFile: "BurnsAllenCoats_512kb.mp4",
        runtime: 26,
        synopsis:
          "Gracie buys fur coats for the whole neighborhood on George's credit — and negotiates him into an even deeper hole.",
      },
      {
        id: "e-ba-2",
        title: "Gracie Thinks She's Not Married",
        season: 3,
        episode: 16,
        iaId: "the-george-burns-and-gracie-allen-show-s-03-e-16-gracie-thinks-shes-not-married",
        iaFile: "The George Burns and Gracie Allen Show - S03E16 - Gracie Thinks She's Not Married.mp4",
        runtime: 26,
        synopsis:
          "A missing photograph convinces Gracie she and George were never legally wed, and her pursuit of a second wedding ruins his peace twice over.",
      },
      {
        id: "e-ba-3",
        title: "The Football Show",
        season: 2,
        episode: 7,
        iaId: "TheGeorgeBurnsAndGracieAllenShow-Football",
        iaFile: "TheFootballShowBurnsAllen_512kb.mp4",
        runtime: 26,
        synopsis:
          "Gracie maneuvers George into coaching a neighborhood football team full of kids, vaudeville rivals and one very tired stagehand.",
      },
    ],
  },
  {
    id: "t-beverly-hillbillies",
    slug: "the-beverly-hillbillies",
    name: "The Beverly Hillbillies",
    year: 1962,
    kind: "show",
    type: "TV Series",
    genres: ["Comedy", "Family"],
    language: "English",
    country: "United States",
    rating: 7.1,
    runtime: 26,
    poster: P("the-beverly-hillbillies"),
    tagline: "Tex. Oil. Millionaires. Fish out of water.",
    synopsis:
      "A backwoods family strikes oil on their land, moves into a Beverly Hills mansion, and proceeds to confuse every banker, socialite and neighbor in California. Fish-out-of-water sitcom gold with Buddy Ebsen's dry warmth at the center, it was America's most-watched show within two seasons. Early episodes are public domain and endlessly rewatchable.",
    director: "Paul Henning",
    cast: ["Buddy Ebsen", "Irene Ryan", "Donna Douglas", "Max Baer Jr."],
    quality: ["HD"],
    accent: "#7a9e4a",
    iaId: "The_Beverly_Hillbillies",
    iaFile: "The_Clampets_Strike_Oil_512kb.mp4",
    episodes: [
      {
        id: "e-bh-1",
        title: "The Clampetts Strike Oil",
        season: 1,
        episode: 1,
        iaId: "The_Beverly_Hillbillies",
        iaFile: "The_Clampets_Strike_Oil_512kb.mp4",
        runtime: 26,
        synopsis:
          "The pilot: black gold bubbles up in Jed's swamp, and the whole family rolls into Beverly Hills in a rattletrap truck.",
      },
      {
        id: "e-bh-2",
        title: "Trick or Treat",
        season: 1,
        episode: 6,
        iaId: "Beverly_Hillbillies_Ep06_Trick_Or_Treat",
        iaFile: "BH06_Trick_Or_Treat_512kb.mp4",
        runtime: 26,
        synopsis:
          "Granny declares war on Halloween, convinced the trick-or-treaters are real goblins come for the family's gold.",
      },
      {
        id: "e-bh-3",
        title: "Elly Needs a Maw",
        season: 2,
        episode: 12,
        iaId: "TheBeverlyHillbillies-EllyNeedsAMaw-Ep2x12",
        iaFile: "TheBeverlyHillbillies212-EllyNeedsAMaw_512kb.mp4",
        runtime: 26,
        synopsis:
          "Granny decides Elly May needs a mother's influence and advertises for a bride — for Jed — with predictably chaotic interviews.",
      },
    ],
  },
];

// Fix a stray character guard (in case any non-ASCII slipped in unexpectedly, keep clean)
export function iaUrl(iaId: string, iaFile: string): string {
  const encoded = iaFile
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `https://archive.org/download/${iaId}/${encoded}`;
}

export function getTitle(idOrSlug: string): Title | undefined {
  return CATALOG.find((t) => t.id === idOrSlug || t.slug === idOrSlug);
}

export const byId = new Map(CATALOG.map((t) => [t.id, t]));

export function episodesOf(t: Title): Episode[] {
  return t.episodes ?? [];
}

export function getEpisode(t: Title, season: number, episode: number): Episode | undefined {
  return episodesOf(t).find((e) => e.season === season && e.episode === episode);
}

export function relatedTo(t: Title, n = 12): Title[] {
  return CATALOG.filter((o) => o.id !== t.id)
    .map((o) => ({
      o,
      score:
        o.genres.filter((g) => t.genres.includes(g)).length * 10 +
        (o.kind === t.kind ? 3 : 0) +
        (o.language === t.language ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score || b.o.rating - a.o.rating)
    .slice(0, n)
    .map((x) => x.o);
}

export const FEATURED_IDS = ["t-metropolis", "t-notld", "t-sintel", "t-charade", "t-bbb"];

export function trending(n = 12): Title[] {
  return [...CATALOG].sort((a, b) => b.rating - a.rating).slice(0, n);
}

export function newArrivals(n = 12): Title[] {
  return [...CATALOG].sort((a, b) => b.year - a.year).slice(0, n);
}
