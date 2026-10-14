/** Field-recording attributions (see public/recordings/CREDITS.md). CC BY entries must stay visible in the app. */
export interface Credit {
  sound: string
  title: string
  author: string
  license: string
  licenseUrl?: string
  source: string
}

const BY3 = 'https://creativecommons.org/licenses/by/3.0/'
const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/'

export const CREDITS: Credit[] = [
  { sound: 'Rain on Skylight', title: 'Regen in de tent', author: 'luc de bruijn', license: 'CC BY 3.0', licenseUrl: BY3, source: 'https://commons.wikimedia.org/wiki/File:Regen_in_de_tent_-_SoundCloud_-_luc_de_bruijn.ogg' },
  { sound: 'Ocean Waves', title: 'Oceanwavescrushing', author: 'Luftrum', license: 'CC BY 3.0', licenseUrl: BY3, source: 'https://commons.wikimedia.org/wiki/File:Oceanwavescrushing.ogg' },
  { sound: 'Fireplace', title: 'Campfire sound ambience', author: 'Glaneur de sons', license: 'CC BY 3.0', licenseUrl: BY3, source: 'https://commons.wikimedia.org/wiki/File:Campfire_sound_ambience.ogg' },
  { sound: 'Midnight Shinjuku', title: 'Urban Street on a Rainy Afternoon', author: 'Extemporalist', license: 'CC0', licenseUrl: CC0, source: 'https://commons.wikimedia.org/wiki/File:Urban_Street_on_a_Rainy_Afternoon.flac' },
  { sound: 'Café Murmur', title: 'Restaurant ambience', author: 'stephan (pdsounds.org)', license: 'Public domain', source: 'https://commons.wikimedia.org/wiki/File:Restaurant_ambience.ogg' },
  { sound: 'Forest Dawn', title: 'Dawnchorus-uk', author: 'Silas S. Brown', license: 'Public domain', source: 'https://commons.wikimedia.org/wiki/File:Dawnchorus-uk.ogg' },
  { sound: 'Distant Thunder', title: 'Thunderstorm after hot summer day', author: 'stephan (pdsounds.org)', license: 'Public domain', source: 'https://commons.wikimedia.org/wiki/File:Thunderstorm_after_hot_summer_day_17_minutes_01_of_04.ogg' },
  { sound: 'Mountain Stream', title: 'stream-river-water-up-close', author: 'jackthemurray', license: 'CC0', licenseUrl: CC0, source: 'https://commons.wikimedia.org/wiki/File:433589_jackthemurray_stream-river-water-up-close.wav' },
  { sound: 'Night Train', title: 'MoHa 201 series train on the Chūō Main Line, Tokyo', author: 'Toshinori baba', license: 'Public domain', source: 'https://commons.wikimedia.org/wiki/File:Sound_of_a_MoHa_201_series_electric_multiple_unit_train_on_the_Ch%C5%AB%C5%8D_Main_Line_(Ochanomizu%E2%80%93Yotsuya),_Tokyo,_Japan_-_20101010.ogg' },
  { sound: 'Wind in Pines', title: 'Killiney Hill Storm Floris', author: 'Karlunun', license: 'CC0', licenseUrl: CC0, source: 'https://commons.wikimedia.org/wiki/File:Killiney_Hill_Storm_Floris_20250804_1537.ogg' },
]
