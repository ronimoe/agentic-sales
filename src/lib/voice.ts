export type VoiceKey = "akrab" | "sopan" | "semangat";

export const VOICES: Record<VoiceKey, { name: string; tone: string; ad: string; chat: string }> = {
  akrab: { name: "Akrab", tone: "Akrab, jelas, seperti teman yang paham produknya", ad: "Pulang kerja, wajah nggak kusam lagi. Cobain satu botol dulu, Kak.", chat: "Halo Kak! Ini masih ada kok. Mau yang ukuran berapa?" },
  sopan: { name: "Sopan", tone: "Sopan dan tenang, memakai bahasa yang rapi", ad: "Bantu kulit tampak lebih cerah setiap malam. Tersedia hari ini.", chat: "Selamat siang, Kak. Produk ini masih tersedia. Boleh kami bantu pilihkan ukurannya?" },
  semangat: { name: "Semangat", tone: "Ceria dan penuh energi, tanpa berlebihan", ad: "Waktunya kulit glowing! Rutinitas 1 menit, gampang banget!", chat: "Halo Kak! Pas banget, stoknya masih ada! Mau ukuran berapa nih?" },
};

/** Lets the offline demo show the chosen voice. With Claude, the example goes to the prompt instead. */
export function applyVoice(text: string, key?: VoiceKey) {
  if (key === "sopan") return text.replace(/\bnggak\b/g, "tidak").replace(/!/g, ".").replace(/^Halo Kak\b/, "Selamat datang, Kak");
  if (key === "semangat") return text.replace(/\.$/, "!").replace(/^Halo Kak\b/, "Halo Kak, senang banget kamu chat");
  return text;
}
