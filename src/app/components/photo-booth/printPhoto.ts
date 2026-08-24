"use client";

// Ventana de impresión compartida entre ResultStep (botón "Imprimir" en la
// tablet/celular) y (public)/print/page.tsx (panel de print jobs) - ambas
// imprimen sobre la misma Canon SELPHY CP1500 con papel postal (10x14.8cm).
// Antes cada archivo tenía su propia copia de este HTML/CSS: se corrigió el
// bug de página en una copia y se quedó rota en la otra (ver historial) -
// de ahí este único punto de verdad.
export function printPhoto(url: string): void {
    const printWin = window.open("", "_blank");
    if (!printWin) {
        alert("El navegador bloqueó la ventana de impresión.");
        return;
    }
    printWin.document.write(`
            <html>
                <head>
                    <title>Imprimir</title>
                    <style>
                        /* size: auto (o solo margin:0 sin size) deja que el
                           navegador use el tamaño de página por defecto
                           (Carta/A4) en vez del papel postal real (10x14.8cm)
                           de la Selphy CP1500 - el driver termina imprimiendo
                           esa hoja grande reducida/paginada sobre el papel
                           chico, dejando la foto flotando con márgenes
                           grandes, o partida en dos páginas. Fijar el tamaño
                           exacto del papel acá hace que tanto el navegador
                           como el driver encuadren sobre el tamaño real. Si
                           cambia el cassette de papel, actualizar esta medida
                           (y la del cassette real cargado en Windows). */
                        @page { size: 100mm 148mm; margin: 0; }
                        html, body { margin: 0; padding: 0; height: 100%; background: #fff; }
                        /* 100% (no 100vw/100vh): en el contexto de impresión,
                           varios navegadores móviles (Chrome/Safari en
                           Android/iOS) calculan vw/vh contra el viewport de
                           pantalla del celular/tablet, no contra la página
                           impresa - eso hacía que la imagen quedara más alta
                           que una hoja y se partiera en dos páginas (el bug
                           reportado). % sí queda atado correctamente al
                           tamaño real de la página vía html,body{height:100%}.
                           cover, no contain: la relación 3:4 de la foto (0.75)
                           no calza exacto con la del papel postal (100/148 =
                           0.676) - con "contain" quedarían franjas blancas a
                           los lados. "cover" llena el papel completo sin
                           ningún margen, recortando apenas ~10% de los bordes
                           izquierdo/derecho de la foto. */
                        img { display: block; width: 100%; height: 100%; object-fit: cover; }
                    </style>
                </head>
                <body>
                    <img src="${url}" />
                    <script>window.onload = function(){ window.print(); setTimeout(()=>window.close(), 300); };</script>
                </body>
            </html>
        `);
    printWin.document.close();
}
