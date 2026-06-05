// Konstanta konfigurasi global — ubah di sini agar berpengaruh ke seluruh app

export const STORAGE_KEY = "d3-jadwal-state-v1";
export const DEFAULT_CSV_URL = "/Jadwal Gasal 25_26.csv";
export const SLOT_MINUTES = 50;
export const REST_START_TIME = "12:00";
export const MAX_UNDO_STEPS = 30;

// Konfigurasi layout SVG (semua nilai dalam piksel)
export const LAYOUT = {
  margin: { top: 18, left: 18, right: 18, bottom: 18 },
  dayLabelW: 42,   // lebar label hari (ditampilkan vertikal)
  timeColW: 120,  // lebar kolom label waktu
  headerH: 38,   // tinggi baris header nama ruangan
  rowH: 38,   // tinggi per slot waktu (lebih tinggi agar teks cukup)
  colW: 200,  // lebar per kolom ruangan (lebih lebar agar nama MK tidak kepotong)
  dayGap: 28,   // jarak vertikal antar section hari
};
