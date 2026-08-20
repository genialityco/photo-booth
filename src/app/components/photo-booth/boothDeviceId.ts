"use client";

const STORAGE_KEY = "boothDeviceId";

/**
 * Id estable por navegador/dispositivo (localStorage, no sessionStorage) para
 * que una tablet que recarga la página siga reconociéndose como el mismo
 * "device" y pueda retomar el rol de líder sin esperar el timeout de
 * staleness — ver useBoothLiveSession.
 */
export function getBoothDeviceId(): string {
  if (typeof window === "undefined") return "server";

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // localStorage inaccesible (modo privado estricto, etc.) — degradar a un
    // id por-montaje; en el peor caso, un reload de esa tablet entra unos
    // segundos en modo espejo hasta que el doc quede stale.
    return `dev_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  }
}
