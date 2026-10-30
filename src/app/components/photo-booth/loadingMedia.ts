/**
 * `loadingMediaUrl` del evento acepta un GIF o un video (WEBM/MP4). Se sube
 * con `${field}.${ext}` (ver eventService), así que la URL de Storage termina
 * en la extensión real; antes de guardar es un data: URL con su mime.
 */
export function isVideoMediaSrc(src: string): boolean {
  if (src.startsWith("data:")) return src.startsWith("data:video/");
  return /\.(webm|mp4|m4v|mov|quicktime)(\?.*)?$/i.test(src);
}
