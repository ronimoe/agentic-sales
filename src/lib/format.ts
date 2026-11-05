const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
export const idr = (n: number) => rupiah.format(Math.round(n));
export const idrShort = (n: number) => `Rp${compact.format(Math.round(n))}`;
export const num = (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n));
export const pct = (n: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n * 100)}%`;

const TZ = "Asia/Jakarta";
export const timeWib = (d: Date, locale = "id-ID") =>
  `${new Intl.DateTimeFormat(locale, { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d)} WIB`;
export const dateWib = (d: Date, locale = "id-ID") =>
  new Intl.DateTimeFormat(locale, { timeZone: TZ, day: "numeric", month: "short" }).format(d);
export const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
export const hourWib = (d: Date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(d));
