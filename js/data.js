/* ============================================================
   data.js — contenido del cancionero
   ------------------------------------------------------------
   Aquí están los artistas, las canciones y los ritmos.

   CÓMO AÑADIR TUS TRANSCRIPCIONES
   1. Copia un objeto de la lista SONGS y pégalo al final.
   2. Cambia "id" (único, sin espacios ni acentos), "title",
      "artist" (debe coincidir con el slug de un artista de
      ARTISTS o crear uno nuevo), y "content".
   3. En "content" escribe los acordes EN LA LÍNEA DE ARRIBA y
      la letra debajo, usando espacios. Los acordes se detectan
      solos y se pueden transportar.
   4. También puedes hacerlo desde la web: "Enviar una canción"
      (se guarda en tu navegador).

   Las canciones incluidas son de DOMINIO PÚBLICO y sirven de
   ejemplo. Puedes borrarlas cuando añadas las tuyas.
   ============================================================ */

const SITE = {
  name: "AcordesLibres",
  tagline: "Letras y acordes para tocar hoy",
  description: "Cancionero colaborativo de letras y acordes en español.",
  version: "1.0.0"
};

const ARTISTS = [
  {
    slug: "tradicional-mexicano",
    name: "Tradicional Mexicano",
    country: "México",
    genre: "Tradicional",
    featured: true,
    bio: "Corpus de canciones populares mexicanas transmitidas de forma oral durante generaciones. Las versiones incluidas aquí son arreglos sencillos de dominio público, pensados para aprender y tocar en grupo."
  },
  {
    slug: "tradicional-espanol",
    name: "Tradicional Español",
    country: "España",
    genre: "Tradicional",
    featured: true,
    bio: "Canciones del cancionero popular español, muchas recogidas por folkloristas y cantadas en romerías, tabernas y plazas. Arreglos de dominio público para guitarra."
  },
  {
    slug: "villancicos-tradicionales",
    name: "Villancicos Tradicionales",
    country: "España",
    genre: "Villancico",
    featured: true,
    bio: "Villancicos de Navidad de autoría anónima o tradicional, presentes en el repertorio familiar de toda Hispanoamérica."
  },
  {
    slug: "rondas-infantiles",
    name: "Rondas Infantiles",
    country: "Latinoamérica",
    genre: "Infantil",
    featured: false,
    bio: "Rondas, juegos y canciones de corro que se enseñan en la infancia. Acordes fáciles para acompañar con guitarra o ukelele."
  },
  {
    slug: "tradicional-andino",
    name: "Tradicional Andino",
    country: "Perú",
    genre: "Andino",
    featured: true,
    bio: "Repertorio instrumental de los Andes peruanos. La pieza incluida es un clásico del repertorio sudamericano, ya en dominio público, con una progresión sencilla para practicar arpegios."
  }
];

const RHYTHMS = [
  {
    id: "balada",
    name: "Balada",
    time: "4/4",
    pattern: "↓ · ↓↑ · ↑↓↑",
    desc: "Rasgueo suave con acentos en el primer y tercer tiempo. Ideal para baladas lentas y medios tiempos.",
    genres: ["Balada", "Romántico", "Pop"]
  },
  {
    id: "rock",
    name: "Rock",
    time: "4/4",
    pattern: "↓ · ↓↑ · ↓ · ↓↑",
    desc: "Corcheas constantes con acentos marcados. La mano derecha mantiene el pulso y la izquierda apaga las cuerdas en los silencios.",
    genres: ["Rock", "Pop"]
  },
  {
    id: "pop",
    name: "Pop",
    time: "4/4",
    pattern: "↓ ↓↑ ↑↓↑ ↓↑",
    desc: "Patrón de ocho corcheas, el más habitual para acompañar canciones pop.",
    genres: ["Pop", "Balada"]
  },
  {
    id: "son-jarocho",
    name: "Son jarocho",
    time: "4/4",
    pattern: "↓ · ↓↑ · ↑ · ↓↑",
    desc: "Ritmo ternario característico del son jarocho, con rasgueo vivo y percusión en la tapa de la guitarra.",
    genres: ["Tradicional"]
  },
  {
    id: "vals",
    name: "Vals",
    time: "3/4",
    pattern: "↓ · ↓↑ · ↓↑",
    desc: "Tres tiempos por compás: bajo en el primero y acordes en los dos siguientes.",
    genres: ["Tradicional", "Villancico", "Balada"]
  },
  {
    id: "habanera",
    name: "Habanera",
    time: "2/4",
    pattern: "↓ · · ↑ · ↓↑",
    desc: "Ritmo de habanera, con el característico contratiempo. Se usa en canciones cubanas y en la canción española de salón.",
    genres: ["Tradicional", "Tropical"]
  },
  {
    id: "huayno",
    name: "Huayno",
    time: "2/4",
    pattern: "↓ ↓↑ ↓ ↓↑",
    desc: "Ritmo andino de dos tiempos, con acentos marcados y mucho uso de arpegios.",
    genres: ["Andino", "Tradicional"]
  },
  {
    id: "villancico",
    name: "Villancico",
    time: "3/4",
    pattern: "↓ ↓ ↓ ↑↓↑",
    desc: "Rasgueo sencillo en tres tiempos, alegre y repetitivo, perfecto para cantar en grupo.",
    genres: ["Villancico"]
  },
  {
    id: "ronda",
    name: "Ronda infantil",
    time: "4/4",
    pattern: "↓ ↓ ↑ · ↓ ↓ ↑",
    desc: "Acompañamiento sencillo de dos acordes por compás, pensado para cantar y jugar.",
    genres: ["Infantil"]
  }
];

const SONGS = [
  {
    id: "la-bamba",
    title: "La Bamba",
    artist: "tradicional-mexicano",
    artistName: "Tradicional Mexicano",
    composer: "Tradicional (son jarocho)",
    year: "s. XIX",
    country: "México",
    genre: "Tradicional",
    key: "C",
    capo: 0,
    tuning: "E A D G B E",
    time: "4/4",
    bpm: 100,
    rhythm: "son-jarocho",
    difficulty: "Fácil",
    license: "Dominio público",
    views: 4820,
    added: "2026-09-02",
    content: `[Intro]
C   F   G   C

[Verso 1]
C                 F
Para bailar la bamba
   G              C
para bailar la bamba
   F              G
se necesita una poca de gracia
C          F       G      C
una poca de gracia y otra cosita
F       G       C
ay arriba y arriba
F       G       C
ay arriba y arriba
F          G          C
por ti seré, por ti seré, por ti seré

[Estribillo]
C      F      G      C
Bamba, bamba, bamba
C      F      G      C
bamba, bamba, bamba
F      G      C
bamba, bamba, bamba

[Verso 2]
C                 F
Para bailar la bamba
   G              C
se necesita una poca de gracia
   F              G
se necesita una poca de gracia
C          F       G      C
una poca de gracia y otra cosita
F       G       C
ay arriba y arriba
F       G       C
ay arriba y arriba
F          G          C
por ti seré, por ti seré, por ti seré

[Estribillo]
C      F      G      C
Bamba, bamba, bamba
C      F      G      C
bamba, bamba, bamba
F      G      C
bamba, bamba, bamba`
  },
  {
    id: "las-mananitas",
    title: "Las Mañanitas",
    artist: "tradicional-mexicano",
    artistName: "Tradicional Mexicano",
    composer: "Tradicional",
    year: "s. XIX",
    country: "México",
    genre: "Tradicional",
    key: "G",
    capo: 0,
    tuning: "E A D G B E",
    time: "3/4",
    bpm: 92,
    rhythm: "vals",
    difficulty: "Fácil",
    license: "Dominio público",
    views: 3910,
    added: "2026-09-04",
    content: `[Intro]
G   C   D7   G

[Verso 1]
G                 C
Estas son las mañanitas
D7                G
que cantaba el Rey David
G                 C
a las muchachas bonitas
D7                G
se las cantamos aquí

[Estribillo]
G            C
Despierta, mi bien, despierta
D7           G
mira que ya amaneció
G            C
ya los pajarillos cantan
D7           G
la luna ya se metió

[Verso 2]
G                 C
Qué linda está la mañana
D7                G
en que vengo a saludarte
G                 C
venimos todos con gusto
D7                G
y placer a felicitarte

[Estribillo]
G            C
Despierta, mi bien, despierta
D7           G
mira que ya amaneció
G            C
ya los pajarillos cantan
D7           G
la luna ya se metió`
  },
  {
    id: "de-colores",
    title: "De Colores",
    artist: "tradicional-mexicano",
    artistName: "Tradicional Mexicano",
    composer: "Tradicional",
    year: "s. XX (popular)",
    country: "México",
    genre: "Tradicional",
    key: "C",
    capo: 0,
    tuning: "E A D G B E",
    time: "3/4",
    bpm: 108,
    rhythm: "vals",
    difficulty: "Fácil",
    license: "Dominio público",
    views: 2760,
    added: "2026-09-08",
    content: `[Verso 1]
C                        F
De colores, de colores
       G7                C
se visten los campos en la primavera
C                        F
De colores, de colores
       G7                C
son los pajaritos que vienen de afuera
C                        F
De colores, de colores
       G7            C
es el arco iris que vemos lucir

[Estribillo]
C        F
Y por eso los grandes amores
G7       C
de muchos colores me gustan a mí
C        F
Y por eso los grandes amores
G7       C
de muchos colores me gustan a mí

[Verso 2]
C                        F
De colores, de colores
       G7                C
son los mil reflejos que el sol atesora
C                        F
De colores, de colores
       G7                C
se tiñe el arroyo cuando el sol colora
C                        F
De colores, de colores
       G7            C
es el arco iris que vemos lucir`
  },
  {
    id: "la-cucaracha",
    title: "La Cucaracha",
    artist: "tradicional-mexicano",
    artistName: "Tradicional Mexicano",
    composer: "Tradicional",
    year: "s. XX (popular)",
    country: "México",
    genre: "Tradicional",
    key: "C",
    capo: 0,
    tuning: "E A D G B E",
    time: "4/4",
    bpm: 120,
    rhythm: "son-jarocho",
    difficulty: "Fácil",
    license: "Dominio público",
    views: 2140,
    added: "2026-09-11",
    content: `[Verso 1]
C
La cucaracha, la cucaracha
G7
ya no puede caminar
C
porque no tiene, porque le falta
G7              C
las dos patitas de atrás

[Verso 2]
C
Ya murió la cucaracha
G7
ya la llevan a enterrar
C
entre cuatro zopilotes
G7              C
y un ratón de sacristán

[Verso 3]
C
Cuando la cucaracha
G7
se toma la borrachera
C
se le sube a la cabeza
G7              C
y se cae de la escalera`
  },
  {
    id: "la-tarara",
    title: "La Tarara",
    artist: "tradicional-espanol",
    artistName: "Tradicional Español",
    composer: "Popular (recogida por F. García Lorca)",
    year: "tradicional",
    country: "España",
    genre: "Tradicional",
    key: "Am",
    capo: 0,
    tuning: "E A D G B E",
    time: "4/4",
    bpm: 96,
    rhythm: "pop",
    difficulty: "Fácil",
    license: "Dominio público",
    views: 1890,
    added: "2026-09-14",
    content: `[Verso 1]
Am
La Tarara, sí
G
la Tarara, no
F            E
la Tarara, niña
Am
que la bailo yo

[Verso 2]
Am
La Tarara tiene
G
un vestido blanco
F              E
con lunares rojos
Am
que le dio el barquillero

[Verso 3]
Am
La Tarara, sí
G
la Tarara, no
F            E
la Tarara, niña
Am
que la bailo yo

[Estribillo]
Am          G
Tiene la Tarara
F           E
un vestido blanco
Am          G
con lunares rojos
F           E
y un pañuelo al cuello`
  },
  {
    id: "el-vito",
    title: "El Vito",
    artist: "tradicional-espanol",
    artistName: "Tradicional Español",
    composer: "Popular andaluza",
    year: "tradicional",
    country: "España",
    genre: "Tradicional",
    key: "Am",
    capo: 0,
    tuning: "E A D G B E",
    time: "3/4",
    bpm: 132,
    rhythm: "vals",
    difficulty: "Intermedio",
    license: "Dominio público",
    views: 1220,
    added: "2026-09-17",
    content: `[Estribillo]
Am
Una vieja y un viejo
G
se fueron a bailar
F
y en medio del fandango
E
se pusieron a llorar

[Verso 1]
Am
El vito, el vito, el vito
G
el vito y la vito, va
F
el vito, el vito, el vito
E
que lo baila la mocita

[Verso 2]
Am
Con el vito, vito, vito
G
con el vito, vito, va
F
no me mires a la cara
E
que me voy a sonrojar

[Estribillo]
Am
Una vieja y un viejo
G
se fueron a bailar
F
y en medio del fandango
E
se pusieron a llorar`
  },
  {
    id: "campana-sobre-campana",
    title: "Campana sobre campana",
    artist: "villancicos-tradicionales",
    artistName: "Villancicos Tradicionales",
    composer: "Tradicional",
    year: "tradicional",
    country: "España",
    genre: "Villancico",
    key: "G",
    capo: 0,
    tuning: "E A D G B E",
    time: "3/4",
    bpm: 112,
    rhythm: "villancico",
    difficulty: "Fácil",
    license: "Dominio público",
    views: 3320,
    added: "2026-09-21",
    content: `[Estribillo]
G              C
Campana sobre campana
D7             G
y sobre campana una
G              C
asómate a la ventana
D7             G
verás al Niño en la cuna

[Estribillo 2]
G         C
Belén, campanas de Belén
D7        G
que los ángeles tocan
G         C
¿qué nuevas me traéis?
D7        G
Belén, campanas de Belén

[Verso 1]
G              C
Recogido tu rebaño
D7             G
¿a dónde vas, pastorcito?
G              C
Voy a llevar al portal
D7             G
requesón, manteca y vino

[Verso 2]
G              C
Campana sobre campana
D7             G
y sobre campana dos
G              C
asómate a la ventana
D7             G
porque está naciendo Dios`
  },
  {
    id: "ande-ande-ande",
    title: "Ande, ande, ande",
    artist: "villancicos-tradicionales",
    artistName: "Villancicos Tradicionales",
    composer: "Tradicional",
    year: "tradicional",
    country: "España",
    genre: "Villancico",
    key: "C",
    capo: 0,
    tuning: "E A D G B E",
    time: "3/4",
    bpm: 120,
    rhythm: "villancico",
    difficulty: "Fácil",
    license: "Dominio público",
    views: 2980,
    added: "2026-09-23",
    content: `[Estribillo]
C
Ande, ande, ande
G7
ande, ande, ande
C
la marimorena
G7      C
ande, ande, ande

[Verso 1]
C
En el portal de Belén
G7
hay estrella, sol y luna
C
la Virgen y San José
G7            C
y el Niño que está en la cuna

[Estribillo]
C
Ande, ande, ande
G7
ande, ande, ande
C
la marimorena
G7      C
ande, ande, ande

[Verso 2]
C
En el portal de Belén
G7
han entrado los ratones
C
y al bueno de San José
G7            C
le han roído los calzones`
  },
  {
    id: "noche-de-paz",
    title: "Noche de paz",
    artist: "villancicos-tradicionales",
    artistName: "Villancicos Tradicionales",
    composer: "Joseph Mohr / Franz Xaver Gruber (1818)",
    year: "1818",
    country: "Austria",
    genre: "Villancico",
    key: "C",
    capo: 0,
    tuning: "E A D G B E",
    time: "3/4",
    bpm: 76,
    rhythm: "villancico",
    difficulty: "Fácil",
    license: "Dominio público",
    views: 3640,
    added: "2026-09-25",
    content: `[Verso 1]
C
Noche de paz, noche de amor
G7             C
todo duerme en derredor
C7             F
entre los astros que esparcen su luz
C              G7
bella anunciando al niñito Jesús
C          F
Brilla la estrella de paz
C          G7   C
brilla la estrella de paz

[Verso 2]
C
Noche de paz, noche de amor
G7             C
oye humilde el pastor
C7             F
que en los campos anuncian el bien
C              G7
y en el cielo los ángeles también
C          F
Brilla la estrella de paz
C          G7   C
brilla la estrella de paz

[Verso 3]
C
Noche de paz, noche de amor
G7             C
todo duerme en derredor
C7             F
sólo velan en la oscuridad
C              G7
los que guardan en ella la paz
C          F
Brilla la estrella de paz
C          G7   C
brilla la estrella de paz`
  },
  {
    id: "que-llueva",
    title: "Que llueva, que llueva",
    artist: "rondas-infantiles",
    artistName: "Rondas Infantiles",
    composer: "Popular infantil",
    year: "tradicional",
    country: "España",
    genre: "Infantil",
    key: "C",
    capo: 0,
    tuning: "E A D G B E",
    time: "4/4",
    bpm: 116,
    rhythm: "ronda",
    difficulty: "Principiante",
    license: "Dominio público",
    views: 1540,
    added: "2026-09-28",
    content: `[Verso 1]
C
Que llueva, que llueva
G7
la Virgen de la Cueva
C
los pajaritos cantan
G7        C
las nubes se levantan

[Verso 2]
C
Que sí, que no
G7
que caiga un chaparrón
C
que sí, que no
G7        C
que caiga un chaparrón

[Verso 3]
C
Que llueva, que llueva
G7
la Virgen de la Cueva
C
los pajaritos cantan
G7        C
las nubes se levantan`
  },
  {
    id: "cumpleanos-feliz",
    title: "Cumpleaños feliz",
    artist: "rondas-infantiles",
    artistName: "Rondas Infantiles",
    composer: "Popular (melodía tradicional)",
    year: "tradicional",
    country: "Latinoamérica",
    genre: "Infantil",
    key: "C",
    capo: 0,
    tuning: "E A D G B E",
    time: "3/4",
    bpm: 108,
    rhythm: "ronda",
    difficulty: "Principiante",
    license: "Dominio público",
    views: 4210,
    added: "2026-10-01",
    content: `[Estribillo]
C
Cumpleaños feliz
G7
cumpleaños feliz
G7            C
te deseamos todos
C
cumpleaños feliz

[Estribillo 2]
C
Cumpleaños feliz
G7
cumpleaños feliz
G7            C
te deseamos todos
C
cumpleaños feliz`
  },
  {
    id: "el-condor-pasa",
    title: "El Cóndor Pasa",
    artist: "tradicional-andino",
    artistName: "Tradicional Andino",
    composer: "Daniel Alomía Robles (1913)",
    year: "1913",
    country: "Perú",
    genre: "Andino",
    key: "Em",
    capo: 0,
    tuning: "E A D G B E",
    time: "2/4",
    bpm: 88,
    rhythm: "huayno",
    difficulty: "Intermedio",
    license: "Dominio público",
    views: 2650,
    added: "2026-10-05",
    content: `[Introducción]
Em   G   D   Em
Em   G   D   Em

[Melodía A]
Em           G
D            Em
Em           G
D            Em

[Melodía B]
C            D
Em           Em
C            D
Em           Em

[Melodía C]
G            D
Em           Em
G            D
Em           Em

[Final]
Em   G   D   Em`
  }
];
