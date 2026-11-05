"use client";
import { useEffect, useState } from "react";

export function Flash({ text }: { text: string }) {
  const [show, setShow] = useState(true);
  useEffect(() => { document.cookie = "flash=; Max-Age=0; path=/"; const t = setTimeout(() => setShow(false), 8000); return () => clearTimeout(t); }, []);
  if (!show) return null;
  return <div role="status" className="mb-5 flex items-start justify-between gap-3 rounded-xl bg-tinta px-4 py-3 text-white"><span>{text}</span><button onClick={() => setShow(false)} className="font-semibold underline">OK</button></div>;
}
