/** Cadena WIFI: para QR (RFC informal usado por Android/iOS). */

export type WifiSecurity = "WPA" | "WEP" | "nopass";

export type WifiConfig = {
  ssid: string;
  password: string;
  security: WifiSecurity;
  hidden: boolean;
};

/** Escapa caracteres especiales de la carga WIFI:. */
export function escapeWifiField(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

export function wifiPayload(w: WifiConfig): string {
  const s = escapeWifiField(w.ssid);
  const pass = w.security === "nopass" ? "" : `P:${escapeWifiField(w.password)};`;
  return `WIFI:T:${w.security};S:${s};${pass}H:${w.hidden};;`;
}
