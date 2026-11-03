export type ToriiPartId = 'hashira' | 'ryobu' | 'nuki' | 'hengaku' | 'kasagi';

export type ExhibitionChapterId =
  | 'hero'
  | 'disassemble'
  | 'hashira'
  | 'ryobu'
  | 'nuki'
  | 'hengaku'
  | 'kasagi'
  | 'overview'
  | 'sanctuary';

export type LangId = 'id' | 'en';

export interface ScrollStageMeta {
  id: ExhibitionChapterId;
  index: number;
  stepCode: string;
  kanji: string;
  eyebrow: { id: string; en: string };
  title: { id: string; en: string };
  caption: { id: string; en: string };
  isolatedPart: ToriiPartId | null;
  range: [number, number];
  camStart: [number, number, number];
  camEnd: [number, number, number];
  lookStart: [number, number, number];
  lookEnd: [number, number, number];
  camStartPortrait: [number, number, number];
  camEndPortrait: [number, number, number];
  lookStartPortrait: [number, number, number];
  lookEndPortrait: [number, number, number];
}

export const SCROLL_STAGES: ScrollStageMeta[] = [
  // 0. HERO OPENING: Torii 100% Assembled & Majestic on the Sea
  {
    id: 'hero',
    index: 0,
    stepCode: '00',
    kanji: '厳島',
    eyebrow: {
      id: '厳 島 神 社 大 鳥 居 · MIYAJIMA, JEPANG',
      en: '厳 島 神 社 大 鳥 居 · MIYAJIMA, JAPAN',
    },
    title: {
      id: 'Keajaiban Gerbang Apung Itsukushima',
      en: 'The Floating Torii of Itsukushima',
    },
    caption: {
      id: 'Sebuah mahakarya arsitektur kayu 60 ton yang berdiri bebas di atas pasang laut selama berabad-abad—tanpa satu paku pun, dan tanpa ditanam ke dasar bumi.',
      en: 'A 60-ton wooden masterpiece standing freely upon the tidal sea for centuries—built without a single nail or buried foundation.',
    },
    isolatedPart: null,
    range: [0.0, 0.11],
    camStart: [0.0, 2.65, 19.5],
    camEnd: [0.0, 2.75, 18.2],
    lookStart: [0.0, 2.55, 0.0],
    lookEnd: [0.0, 2.65, 0.0],
    camStartPortrait: [0.0, 2.65, 25.5],
    camEndPortrait: [0.0, 2.75, 24.0],
    lookStartPortrait: [0.0, 2.45, 0.0],
    lookEndPortrait: [0.0, 2.55, 0.0],
  },

  // 1. THE DISASSEMBLY HOOK: Full Gate Gracefully Levitates Apart in 3D Space
  {
    id: 'disassemble',
    index: 1,
    stepCode: '01',
    kanji: '木組',
    eyebrow: {
      id: 'ANATOMI KIGUMI · STRUKTUR TERURAI',
      en: 'KIGUMI ANATOMY · EXPLODED STRUCTURE',
    },
    title: {
      id: '22 Elemen Kayu yang Saling Mengunci',
      en: '22 Interlocking Timber Elements',
    },
    caption: {
      id: 'Mari membedah bagaimana setiap bagian dirangkai secara presisi untuk meredam hantaman ombak dan angin topan.',
      en: 'Explore how each architectural component is crafted to absorb storm surges and typhoons.',
    },
    isolatedPart: null,
    range: [0.11, 0.22],
    camStart: [0.0, 2.85, 18.2],
    camEnd: [-1.8, 3.45, 17.5],
    lookStart: [0.0, 2.75, 0.0],
    lookEnd: [0.0, 3.25, 0.0],
    camStartPortrait: [0.0, 2.85, 24.0],
    camEndPortrait: [-1.2, 3.45, 23.5],
    lookStartPortrait: [0.0, 2.65, 0.0],
    lookEndPortrait: [0.0, 3.15, 0.0],
  },

  // 2. PART 1: HASHIRA (Main Pillars completely framed from plinth to top)
  {
    id: 'hashira',
    index: 2,
    stepCode: '02',
    kanji: '主柱',
    eyebrow: {
      id: 'BAGIAN 01 / 05 · 主柱 HASHIRA',
      en: 'PART 01 / 05 · 主柱 HASHIRA',
    },
    title: {
      id: 'Pilar Utama Kayu Kamper',
      en: 'Ancient Camphorwood Pillars',
    },
    caption: {
      id: 'Dua batang pohon kamper utuh berusia 600 tahun yang hanya bertumpu di atas batu dasar laut tanpa ditanam.',
      en: 'Two 600-year-old camphor tree trunks resting freely on underwater stone plinths without buried foundations.',
    },
    isolatedPart: 'hashira',
    range: [0.22, 0.33],
    camStart: [-2.2, 2.85, 12.8],
    camEnd: [1.8, 3.05, 12.2],
    lookStart: [-0.35, 2.55, 0.0],
    lookEnd: [0.25, 2.65, 0.0],
    camStartPortrait: [-1.5, 2.85, 16.8],
    camEndPortrait: [1.2, 3.05, 16.2],
    lookStartPortrait: [0.0, 2.45, 0.0],
    lookEndPortrait: [0.0, 2.55, 0.0],
  },

  // 3. PART 2: RYOBU (4 Ocean Outrigger Pillars)
  {
    id: 'ryobu',
    index: 3,
    stepCode: '03',
    kanji: '控柱',
    eyebrow: {
      id: 'BAGIAN 02 / 05 · 控柱 RYŌBU-BASHIRA',
      en: 'PART 02 / 05 · 控柱 RYŌBU-BASHIRA',
    },
    title: {
      id: 'Empat Kaki Penopang Samudra',
      en: 'Four Ocean Outrigger Pillars',
    },
    caption: {
      id: 'Mengawal pilar utama di sisi depan dan belakang agar gerbang tak tergoyahkan oleh arus pasang.',
      en: 'Flanking the main pillars front and rear to brace the gate against powerful tidal currents.',
    },
    isolatedPart: 'ryobu',
    range: [0.33, 0.44],
    camStart: [-3.1, 2.45, 11.8],
    camEnd: [2.8, 2.65, 11.4],
    lookStart: [-0.4, 2.05, 0.0],
    lookEnd: [0.4, 2.15, 0.0],
    camStartPortrait: [-2.1, 2.45, 15.8],
    camEndPortrait: [1.9, 2.65, 15.4],
    lookStartPortrait: [0.0, 1.95, 0.0],
    lookEndPortrait: [0.0, 2.05, 0.0],
  },

  // 4. PART 3: NUKI & KUSABI (Crossbeam, Wedges & Sacred Shimenawa)
  {
    id: 'nuki',
    index: 4,
    stepCode: '04',
    kanji: '貫と楔',
    eyebrow: {
      id: 'BAGIAN 03 / 05 · 貫 NUKI & KUSABI',
      en: 'PART 03 / 05 · 貫 NUKI & KUSABI',
    },
    title: {
      id: 'Balok Pengunci & Pasak Kayu',
      en: 'Penetrating Beam & Wooden Wedges',
    },
    caption: {
      id: 'Balok lintang menembus pilar dan dikunci rapat oleh baji kayu Kusabi tanpa menggunakan logam.',
      en: 'The crossbeam pierces both pillars and is locked tight by tapered wooden wedges without nails.',
    },
    isolatedPart: 'nuki',
    range: [0.44, 0.55],
    camStart: [1.85, 4.25, 10.2],
    camEnd: [-1.45, 4.35, 9.6],
    lookStart: [0.1, 3.85, 0.0],
    lookEnd: [-0.1, 3.92, 0.0],
    camStartPortrait: [1.25, 4.25, 13.6],
    camEndPortrait: [-0.95, 4.35, 13.0],
    lookStartPortrait: [0.0, 3.78, 0.0],
    lookEndPortrait: [0.0, 3.85, 0.0],
  },

  // 5. PART 4: HENGAKU (Imperial Calligraphy Tablet)
  {
    id: 'hengaku',
    index: 5,
    stepCode: '05',
    kanji: '大扁額',
    eyebrow: {
      id: 'BAGIAN 04 / 05 · 扁額 HENGAKU',
      en: 'PART 04 / 05 · 扁額 HENGAKU',
    },
    title: {
      id: 'Prasasti Emas Kaisar Go-Nara',
      en: 'Imperial Calligraphy Tablet',
    },
    caption: {
      id: 'Dipasang dengan celah khusus yang berfungsi sebagai katup pelepas tekanan saat ombak badai menerjang.',
      en: 'Mounted with hidden vents that act as a pressure-relief valve when storm waves strike.',
    },
    isolatedPart: 'hengaku',
    range: [0.55, 0.66],
    camStart: [-1.25, 5.85, 8.6],
    camEnd: [1.15, 5.95, 8.0],
    lookStart: [0.0, 5.38, 0.0],
    lookEnd: [0.0, 5.45, 0.0],
    camStartPortrait: [-0.85, 5.85, 11.2],
    camEndPortrait: [0.75, 5.95, 10.6],
    lookStartPortrait: [0.0, 5.30, 0.0],
    lookEndPortrait: [0.0, 5.38, 0.0],
  },

  // 6. PART 5: KASAGI & OMOISHI (Winged Roof & 7-Ton Ballast Stones)
  {
    id: 'kasagi',
    index: 6,
    stepCode: '06',
    kanji: '笠木',
    eyebrow: {
      id: 'BAGIAN 05 / 05 · 笠木 KASAGI & OMOISHI',
      en: 'PART 05 / 05 · 笠木 KASAGI & OMOISHI',
    },
    title: {
      id: 'Mahkota Atap & 7 Ton Batu Sungai',
      en: 'Winged Roof & 7-Ton Stone Ballast',
    },
    caption: {
      id: 'Rongga balok atapnya diisi ratusan batu bulat sungai untuk menekan seluruh struktur agar tak hanyut.',
      en: 'Inside the hollow roof beam lie 7 tons of river cobbles, anchoring the entire gate by gravity alone.',
    },
    isolatedPart: 'kasagi',
    range: [0.66, 0.77],
    camStart: [2.35, 7.75, 12.6],
    camEnd: [-1.85, 7.25, 11.8],
    lookStart: [0.0, 6.85, 0.0],
    lookEnd: [0.0, 6.55, 0.0],
    camStartPortrait: [1.55, 7.75, 16.8],
    camEndPortrait: [-1.25, 7.25, 15.8],
    lookStartPortrait: [0.0, 6.65, 0.0],
    lookEndPortrait: [0.0, 6.35, 0.0],
  },

  // 7. THE GRAND REASSEMBLY: All Parts Unite Into One Monumental Gate
  {
    id: 'overview',
    index: 7,
    stepCode: '07',
    kanji: '大鳥居',
    eyebrow: {
      id: '大 鳥 居 · KESATUAN SEMPURNA',
      en: '大 鳥 居 · STRUCTURAL UNITY',
    },
    title: {
      id: 'Menyatu Menjadi Satu Rangkaian',
      en: 'United Into One Sacred Gate',
    },
    caption: {
      id: 'Seluruh komponen mengunci kembali menjadi satu kesatuan utuh—terus gulir untuk menyeberangi gerbang.',
      en: 'Every timber locks back into a single 60-ton organism—scroll forward to cross through the gate.',
    },
    isolatedPart: null,
    range: [0.77, 0.89],
    camStart: [0.0, 3.65, 20.5],
    camEnd: [0.0, 2.65, 16.8],
    lookStart: [0.0, 3.15, 0.0],
    lookEnd: [0.0, 2.55, 0.0],
    camStartPortrait: [0.0, 3.65, 26.5],
    camEndPortrait: [0.0, 2.65, 22.0],
    lookStartPortrait: [0.0, 2.95, 0.0],
    lookEndPortrait: [0.0, 2.45, 0.0],
  },

  // 8. VOYAGE TO THE HOKORA SANCTUARY: Get in Touch & Leave a Message
  {
    id: 'sanctuary',
    index: 8,
    stepCode: '08',
    kanji: '祠',
    eyebrow: {
      id: '幽 世 の 祠 · HOKORA SANCTUARY',
      en: '幽 世 の 祠 · HOKORA SANCTUARY',
    },
    title: {
      id: 'Hubungi via WhatsApp di Hokora',
      en: 'Get in Touch on WhatsApp at Hokora',
    },
    caption: {
      id: 'Di tengah keheningan lentera yang mengapung di sekitar kuil, sampaikan pesan, sapaan, atau ajakan kolaborasi langsung ke WhatsApp kami di 0881026711738.',
      en: 'Amidst the quiet glow of lanterns drifting around the shrine, reach out directly with your greeting or collaboration inquiry to WhatsApp at 0881026711738.',
    },
    isolatedPart: null,
    range: [0.89, 1.0],
    camStart: [0.0, 2.55, 14.5],
    camEnd: [0.0, 1.82, -10.5],
    lookStart: [0.0, 2.35, -10.0],
    lookEnd: [0.0, 1.42, -20.2],
    camStartPortrait: [0.0, 2.65, 18.5],
    camEndPortrait: [0.0, 2.42, -5.5],
    lookStartPortrait: [0.0, 2.15, -10.0],
    lookEndPortrait: [0.0, 1.30, -20.2],
  },
];
