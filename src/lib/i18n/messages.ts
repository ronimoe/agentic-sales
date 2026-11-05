export const id = {
  locale: "id-ID",
  nav: { today: "Hari ini", approvals: "Persetujuan", products: "Produk", ads: "Iklan", chats: "Percakapan", orders: "Pesanan", dashboard: "Dasbor", rules: "Aturan", settings: "Pengaturan" },
  sim: "Simulasi",
  simTip: "Layanan ini belum tersambung. Datanya contoh.",
  today: {
    morning: "Selamat pagi.", noon: "Selamat siang.", evening: "Selamat sore.", night: "Selamat malam.",
    needs: (n: number) => n === 0 ? "Semua aman, agen tetap bekerja." : `${n} hal menunggu keputusanmu.`,
    adsReady: (n: number) => `${n} iklan siap ditinjau`, adsReadySub: "Tidak ada yang tayang sebelum kamu setujui", review: "Tinjau",
    chatsNeed: (n: number) => `${n} chat butuh orang`, open: "Buka",
    blocked: (n: number) => `${n} iklan perlu diperbaiki`, blockedSub: "Gagal pemeriksaan klaim",
    profit: "Laba dari barang terkirim", week: "7 hari terakhir", spend: "Belanja iklan", cap: (x: string) => `Batas harian ${x}`,
    transit: "Masih di jalan", transitSub: "Belum dihitung sebagai laba", returned: "Dikembalikan", confirmed: "pasti", estimated: "perkiraan",
    did: "Yang dikerjakan agen, dan alasannya", best: "Sudut pandang terbaik", sales: (n: number) => `${n} terkirim`, noBest: "Belum ada penjualan terkirim.",
  },
  approvals: {
    title: "Persetujuan", left: (n: number) => `${n} iklan menunggu`, doneTitle: "Semua sudah ditinjau", doneBody: "Iklan baru muncul di sini saat tim kreatif selesai membuatnya.", makePlan: "Buat rencana dari produk",
    approve: "Setujui dan tayangkan", reject: "Tolak", rejectWhy: "Kenapa ditolak? Agen belajar dari alasan ini.", confirmReject: "Tolak iklan",
    reasons: ["Klaim terlalu berlebihan", "Tidak sesuai merek", "Visual kurang menarik", "Pesan kurang jelas"], other: "Alasan lain",
    goal: "Tujuan", dest: "Ke mana", budget: "Anggaran harian", angle: "Sudut pandang", audience: "Untuk siapa", check: "Pemeriksaan klaim", passed: "Lolos", text: "Teks iklan", opener: "Pesan pembuka WhatsApp", form: "Pertanyaan formulir", keys: "Tekan A untuk setujui, R untuk tolak", noPerm: "Peranmu tidak bisa menyetujui iklan.",
  },
  products: {
    title: "Produk", add: "Tambah produk", empty: "Tambahkan produk pertamamu", emptyBody: "Isi detailnya, lalu agen menyusun sudut pandang dan iklan.", price: "Harga", margin: "Margin", stock: "Stok", plan: "Buat rencana kampanye", planning: "Agen menyiapkan iklan", angles: "Sudut pandang", campaigns: "Kampanye", noCampaign: "Belum ada kampanye. Buat rencana dan agen menyiapkan semuanya untuk kamu tinjau.", why: "Alasan rencana ini", facts: "Detail produk", bpom: "Nomor BPOM", halal: "Status halal", claims: "Klaim yang disetujui", proof: "Bukti", none: "Belum diisi", name: "Nama produk", desc: "Deskripsi singkat", url: "Link produk", cost: "Modal per barang", category: "Jenis produk", catGeneral: "Umum", catCos: "Kosmetik", catFood: "Makanan atau suplemen", claimsHint: "Satu klaim per baris, sesuai izin edar.", proofHint: "Satu bukti per baris. Contoh: 4,8 dari 1.200 ulasan.", save: "Simpan produk", sold: "terkirim",
  },
  ads: { title: "Iklan", simDay: "Simulasikan satu hari", sync: "Ambil hasil dari Meta", simHint: "Hanya tersedia selama Meta belum tersambung.", pause: "Jeda", resume: "Tayangkan lagi", empty: "Belum ada iklan tayang", emptyBody: "Iklan yang kamu setujui muncul di sini.", spend: "Belanja", paused: "Dijeda", pausedWhy: "Alasan" },
  chats: {
    title: "Percakapan", empty: "Belum ada percakapan", pick: "Pilih percakapan", reply: "Tulis balasan", send: "Kirim", takeover: "Ambil alih", backToAi: "Kembalikan ke AI", fromAd: "Dari iklan", organic: "Chat langsung", form: "Dari formulir", needsHuman: "Butuh orang", ai: "AI membalas", human: "Kamu membalas", noProduct: "Produk belum jelas",
    phone: "Coba sebagai pelanggan", phoneHint: "Kirim pesan seperti pelanggan dari iklan. Nomor ini hanya simulasi.", phoneAd: "Iklan asal", phoneName: "Nama", phoneNum: "Nomor", phoneMsg: "Pesan", phoneSend: "Kirim sebagai pelanggan", noAd: "Tanpa iklan", costNote: "Perkiraan biaya", optIn: "Setuju promo", optNo: "Belum setuju promo",
    stage: { new: "Baru", qualifying: "Bertanya", offer: "Ditawari", ordered: "Memesan", lost: "Berhenti" },
  },
  orders: { title: "Pesanan", empty: "Belum ada pesanan", all: "Semua", product: "Produk", customer: "Pembeli", amount: "Total", profit: "Laba", status: "Status", link: "Sumber iklan", imp: "Impor CSV marketplace", impHint: "Unggah ekspor pesanan dari seller center. Baris yang tidak terbaca dilaporkan, tidak ditebak.", file: "File CSV", channel: "Marketplace", doImport: "Impor pesanan", update: "Ubah", result: (a: number, u: number, e: number) => `${a} pesanan masuk, ${u} tanpa produk cocok, ${e} baris dilewati.`, profitNote: "Laba hanya dihitung setelah barang terkirim." },
  dash: {
    title: "Dasbor", money: "Apakah kita untung?", follow: "Apakah follow-up berjalan?", agents: "Apakah agen makin baik?", spendDaily: "Belanja iklan per hari", profitDaily: "Laba barang terkirim per hari", byChannel: "Laba per saluran", funnel: "Dari chat sampai terkirim", costPerSale: "Biaya per penjualan terkirim", netProfit: "Laba setelah iklan", returnRate: "Tingkat retur", replyAuto: "Dibalas AI", handoffs: "Diserahkan ke orang", waCost: "Perkiraan biaya WhatsApp", approval: "Iklan disetujui", rejected: "Iklan ditolak", compliance: "Lolos pemeriksaan klaim", byGoal: "Hasil per tujuan", table: "Lihat sebagai tabel", day: "Hari", confirmed: "Pasti", partial: "Sebagian pasti", estimated: "Perkiraan", goal: "Tujuan", result: "Hasil",
    steps: { chats: "Chat masuk", orders: "Memesan", delivered: "Terkirim" }, objections: "Keberatan yang sering muncul", noObjection: "Belum ada keberatan tercatat.", learnLater: "Agen belajar menyusul di tahap berikutnya.",
  },
  rules: { title: "Aturan", intro: "Agen mengikuti aturan ini. Setiap perubahan menjadi versi baru, jadi bisa dilacak.", ads: "Aturan iklan", whatsapp: "Aturan WhatsApp", tone: "Nada bicara", list: "Aturan, satu per baris", listHint: "Awali dengan \"larang:\" agar pemeriksaan klaim memblokir kata itu.", save: "Simpan versi baru", version: (v: number) => `Versi ${v}`, goals: "Aturan jeda per tujuan", target: "Target biaya", pauseAt: "Jeda jika belanja tanpa hasil", freq: "Batas frekuensi", saveGoal: "Simpan" },
  settings: {
    title: "Pengaturan", budget: "Anggaran", budgetHint: "Agen tidak bisa melewati batas ini, dijaga langsung oleh sistem.", adsDaily: "Iklan per hari", adsMonthly: "Iklan per bulan", assets: "Pembuatan aset per bulan", ai: "AI per bulan", whatsapp: "WhatsApp per bulan", used: "terpakai", save: "Simpan anggaran",
    canTest: (n: number) => `Anggaran harian ini cukup menguji sekitar ${n} kampanye dengan baik.`,
    conn: "Sambungan", connected: "Tersambung", notConn: "Simulasi", connAi: "Agen AI (Claude)", connAds: "Meta Ads", connWa: "WhatsApp (Evolution API)", connDb: "Database Supabase", connDbLocal: "Sementara di komputer ini", connShop: "Webhook Shopify", connWeb: "Webhook situs Vercel", connHint: "Isi kunci di file .env.local, bukan di chat.",
    workspace: "Bisnis", member: "Masuk sebagai", lang: "Bahasa", switch: "Ganti", waCost: "Perkiraan biaya WhatsApp", marketing: "Pesan promosi", service: "Pesan layanan", quiet: "Jam tenang (WIB)", aiLabel: "Beri label \"Dibuat dengan AI\" pada iklan", saveOther: "Simpan", roles: { owner: "Pemilik", approver: "Penyetuju", sales: "Sales" },
  },
  goal: { eyeball: "Dikenal orang", cold_sell: "Jual langsung", form: "Isi formulir", whatsapp_chat: "Chat WhatsApp", retargeting: "Tawarkan ulang" },
  dest: { whatsapp: "WhatsApp", website: "Situs sendiri", shopify: "Shopify", tokopedia: "Tokopedia", shopee: "Shopee", tiktok_shop: "TikTok Shop", form: "Formulir Meta", none: "Tanpa tujuan klik" },
  channel: { whatsapp: "WhatsApp", website: "Situs sendiri", shopify: "Shopify", tokopedia: "Tokopedia", shopee: "Shopee", tiktok_shop: "TikTok Shop" },
  status: { ordered: "Dipesan", confirmed: "Dikonfirmasi", paid: "Dibayar", shipped: "Dikirim", delivered: "Terkirim", returned: "Dikembalikan", cancelled: "Batal", in_review: "Menunggu", approved: "Disetujui", rejected: "Ditolak", live: "Tayang", paused: "Dijeda", draft: "Draf" },
  attr: { confirmed: "Pasti", partial: "Sebagian pasti", estimated: "Perkiraan", none: "Tanpa iklan" },
  metric: { reach: "Jangkauan", per1000: "Per 1.000 orang", watch: "Menonton", chats: "Chat", leads: "Prospek layak", perLead: "Per prospek", sales: "Penjualan", perSale: "Per penjualan", perChat: "Per chat" },
};
export type Messages = typeof id;

export const en: Messages = {
  locale: "en-GB",
  nav: { today: "Today", approvals: "Approvals", products: "Products", ads: "Ads", chats: "Chats", orders: "Orders", dashboard: "Dashboard", rules: "Rules", settings: "Settings" },
  sim: "Simulated",
  simTip: "This service isn't connected yet. Its data is sample data.",
  today: {
    morning: "Good morning.", noon: "Good afternoon.", evening: "Good afternoon.", night: "Good evening.",
    needs: (n) => n === 0 ? "All clear, and the agents keep working." : `${n} ${n === 1 ? "thing needs" : "things need"} your decision.`,
    adsReady: (n) => `${n} ads ready to review`, adsReadySub: "Nothing goes live until you approve it", review: "Review",
    chatsNeed: (n) => `${n} chats need a person`, open: "Open",
    blocked: (n) => `${n} ads need fixing`, blockedSub: "Failed the claims check",
    profit: "Profit from delivered orders", week: "Last 7 days", spend: "Ad spend", cap: (x) => `Daily cap ${x}`,
    transit: "On the way", transitSub: "Not counted as profit yet", returned: "Returned", confirmed: "confirmed", estimated: "estimated",
    did: "What agents did, and why", best: "Best angles", sales: (n) => `${n} delivered`, noBest: "No delivered sales yet.",
  },
  approvals: {
    title: "Approvals", left: (n) => `${n} ads waiting`, doneTitle: "Everything is reviewed", doneBody: "New ads appear here when the creative team finishes them.", makePlan: "Create a plan from a product",
    approve: "Approve and go live", reject: "Reject", rejectWhy: "Why reject it? Agents learn from this reason.", confirmReject: "Reject ad",
    reasons: ["Claim goes too far", "Off brand", "Weak visual", "Unclear message"], other: "Other reason",
    goal: "Goal", dest: "Goes to", budget: "Daily budget", angle: "Angle", audience: "For whom", check: "Claims check", passed: "Passed", text: "Ad text", opener: "WhatsApp opener", form: "Form questions", keys: "Press A to approve, R to reject", noPerm: "Your role can't approve ads.",
  },
  products: {
    title: "Products", add: "Add product", empty: "Add your first product", emptyBody: "Fill in the details, and agents prepare angles and ads.", price: "Price", margin: "Margin", stock: "Stock", plan: "Create campaign plan", planning: "Agents are preparing ads", angles: "Angles", campaigns: "Campaigns", noCampaign: "No campaigns yet. Create a plan and agents prepare everything for your review.", why: "Why this plan", facts: "Product details", bpom: "BPOM number", halal: "Halal status", claims: "Approved claims", proof: "Proof", none: "Not filled in", name: "Product name", desc: "Short description", url: "Product link", cost: "Cost per item", category: "Product type", catGeneral: "General", catCos: "Cosmetic", catFood: "Food or supplement", claimsHint: "One claim per line, matching the license.", proofHint: "One proof per line. Example: 4.8 from 1,200 reviews.", save: "Save product", sold: "delivered",
  },
  ads: { title: "Ads", simDay: "Simulate one day", sync: "Get results from Meta", simHint: "Only available until Meta is connected.", pause: "Pause", resume: "Resume", empty: "No live ads yet", emptyBody: "Ads you approve appear here.", spend: "Spend", paused: "Paused", pausedWhy: "Reason" },
  chats: {
    title: "Chats", empty: "No chats yet", pick: "Choose a chat", reply: "Write a reply", send: "Send", takeover: "Take over", backToAi: "Return to AI", fromAd: "From ad", organic: "Direct chat", form: "From form", needsHuman: "Needs a person", ai: "AI is replying", human: "You're replying", noProduct: "Product not clear yet",
    phone: "Try as a customer", phoneHint: "Send a message like a customer from an ad. This number is simulated.", phoneAd: "Source ad", phoneName: "Name", phoneNum: "Number", phoneMsg: "Message", phoneSend: "Send as customer", noAd: "No ad", costNote: "Estimated cost", optIn: "Agreed to promos", optNo: "No promo consent",
    stage: { new: "New", qualifying: "Asking", offer: "Offered", ordered: "Ordered", lost: "Stopped" },
  },
  orders: { title: "Orders", empty: "No orders yet", all: "All", product: "Product", customer: "Customer", amount: "Total", profit: "Profit", status: "Status", link: "Ad source", imp: "Import marketplace CSV", impHint: "Upload the order export from seller center. Unreadable rows are reported, not guessed.", file: "CSV file", channel: "Marketplace", doImport: "Import orders", update: "Update", result: (a, u, e) => `${a} orders imported, ${u} with no matching product, ${e} rows skipped.`, profitNote: "Profit only counts once an order is delivered." },
  dash: {
    title: "Dashboard", money: "Are we making money?", follow: "Is follow-up working?", agents: "Are agents improving?", spendDaily: "Ad spend per day", profitDaily: "Delivered profit per day", byChannel: "Profit by channel", funnel: "From chat to delivered", costPerSale: "Cost per delivered sale", netProfit: "Profit after ads", returnRate: "Return rate", replyAuto: "Replied by AI", handoffs: "Handed to a person", waCost: "Estimated WhatsApp cost", approval: "Ads approved", rejected: "Ads rejected", compliance: "Passed claims check", byGoal: "Results by goal", table: "View as table", day: "Day", confirmed: "Confirmed", partial: "Partly confirmed", estimated: "Estimated", goal: "Goal", result: "Result",
    steps: { chats: "Chats received", orders: "Ordered", delivered: "Delivered" }, objections: "Common objections", noObjection: "No objections recorded yet.", learnLater: "Agent learning comes in a later phase.",
  },
  rules: { title: "Rules", intro: "Agents follow these rules. Each change becomes a new version you can trace.", ads: "Ad rules", whatsapp: "WhatsApp rules", tone: "Tone", list: "Rules, one per line", listHint: "Start with \"larang:\" to make the claims check block that word.", save: "Save new version", version: (v) => `Version ${v}`, goals: "Pause rules by goal", target: "Cost target", pauseAt: "Pause after spend with no result", freq: "Frequency limit", saveGoal: "Save" },
  settings: {
    title: "Settings", budget: "Budget", budgetHint: "Agents can't pass these limits. The system enforces them directly.", adsDaily: "Ads per day", adsMonthly: "Ads per month", assets: "Asset creation per month", ai: "AI per month", whatsapp: "WhatsApp per month", used: "used", save: "Save budget",
    canTest: (n) => `This daily budget can properly test about ${n} campaigns.`,
    conn: "Connections", connected: "Connected", notConn: "Simulated", connAi: "AI agents (Claude)", connAds: "Meta Ads", connWa: "WhatsApp (Evolution API)", connDb: "Supabase database", connDbLocal: "Temporary, on this computer", connShop: "Shopify webhook", connWeb: "Vercel site webhook", connHint: "Put keys in .env.local, not in chat.",
    workspace: "Business", member: "Signed in as", lang: "Language", switch: "Switch", waCost: "Estimated WhatsApp cost", marketing: "Promo message", service: "Service message", quiet: "Quiet hours (WIB)", aiLabel: "Label ads as \"Dibuat dengan AI\"", saveOther: "Save", roles: { owner: "Owner", approver: "Approver", sales: "Sales" },
  },
  goal: { eyeball: "Get known", cold_sell: "Direct sale", form: "Form fill", whatsapp_chat: "WhatsApp chat", retargeting: "Offer again" },
  dest: { whatsapp: "WhatsApp", website: "Own website", shopify: "Shopify", tokopedia: "Tokopedia", shopee: "Shopee", tiktok_shop: "TikTok Shop", form: "Meta form", none: "No click destination" },
  channel: { whatsapp: "WhatsApp", website: "Own website", shopify: "Shopify", tokopedia: "Tokopedia", shopee: "Shopee", tiktok_shop: "TikTok Shop" },
  status: { ordered: "Ordered", confirmed: "Confirmed", paid: "Paid", shipped: "Shipped", delivered: "Delivered", returned: "Returned", cancelled: "Cancelled", in_review: "Waiting", approved: "Approved", rejected: "Rejected", live: "Live", paused: "Paused", draft: "Draft" },
  attr: { confirmed: "Confirmed", partial: "Partly confirmed", estimated: "Estimated", none: "No ad" },
  metric: { reach: "Reach", per1000: "Per 1,000 people", watch: "Watched", chats: "Chats", leads: "Qualified leads", perLead: "Per lead", sales: "Sales", perSale: "Per sale", perChat: "Per chat" },
};

export type Lang = "id" | "en";
