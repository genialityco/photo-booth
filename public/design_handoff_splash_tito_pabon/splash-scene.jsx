/* Splash Tito Pabón — continuous composition (animations_v3) */
const { useComposition, animate, interpolate, Easing, clamp } = window;

const MOTION = {
  enter: (opts) => animate({ ease: Easing.easeOutCubic, ...opts }),
  pop:   (opts) => animate({ ease: Easing.easeOutBack, ...opts }),
  drift: (opts) => animate({ ease: Easing.easeInOutSine, ...opts }),
};

const YELLOW = 'radial-gradient(120% 90% at 50% 42%, #FFE79A 0%, #FDD962 45%, #F7C63F 100%)';
const ANTON = "'Anton', sans-serif";

function Blob({ T, x, y, size, from, to, opacity, phase, blur }) {
  const p = Math.sin((T / 6 + phase) * Math.PI * 2);
  const q = Math.cos((T / 7.5 + phase) * Math.PI * 2);
  return (
    <div style={{
      position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: '50%',
      background: `radial-gradient(circle at 45% 42%, ${from}, ${to})`,
      filter: `blur(${blur}px)`, opacity,
      transform: `translate3d(${p * 16}px, ${q * 20}px, 0) scale(${1 + p * 0.07})`,
    }} />
  );
}

function SplashVideo() {
  const { T, CUES, authoredTotal } = useComposition();

  const out = interpolate([CUES.Cierre, CUES.Cierre + 1.0], [1, 0], Easing.easeInOutSine)(T);
  const content = clamp(out, 0, 1);

  const logoY = MOTION.pop({ from: -90, to: 0, start: CUES.Logo, end: CUES.Logo + 0.85 })(T);
  const logoS = MOTION.pop({ from: 0.65, to: 1, start: CUES.Logo, end: CUES.Logo + 0.85 })(T);
  const logoO = MOTION.enter({ from: 0, to: 1, start: CUES.Logo, end: CUES.Logo + 0.35 })(T);

  const l1x = MOTION.enter({ from: -140, to: 0, start: CUES.Titular, end: CUES.Titular + 0.7 })(T);
  const l1o = MOTION.enter({ from: 0, to: 1, start: CUES.Titular, end: CUES.Titular + 0.35 })(T);
  const l1k = MOTION.enter({ from: -24, to: -9, start: CUES.Titular, end: CUES.Titular + 0.7 })(T);
  const l2x = MOTION.enter({ from: 140, to: 0, start: CUES.Titular + 0.25, end: CUES.Titular + 0.95 })(T);
  const l2o = MOTION.enter({ from: 0, to: 1, start: CUES.Titular + 0.25, end: CUES.Titular + 0.6 })(T);
  const l2k = MOTION.enter({ from: 3, to: -9, start: CUES.Titular + 0.25, end: CUES.Titular + 0.95 })(T);

  const subO = MOTION.enter({ from: 0, to: 1, start: CUES.Subtitulo, end: CUES.Subtitulo + 0.5 })(T);
  const subY = MOTION.enter({ from: 22, to: 0, start: CUES.Subtitulo, end: CUES.Subtitulo + 0.55 })(T);

  const cardO = MOTION.enter({ from: 0, to: 1, start: CUES.Mascota, end: CUES.Mascota + 0.4 })(T);
  const cardY = MOTION.pop({ from: 70, to: 0, start: CUES.Mascota, end: CUES.Mascota + 0.9 })(T);
  const cardS = MOTION.pop({ from: 0.8, to: 1, start: CUES.Mascota, end: CUES.Mascota + 0.9 })(T);
  const bob = Math.sin(((T - CUES.Mascota) / 4.2) * Math.PI * 2);
  const bobActive = clamp((T - (CUES.Mascota + 0.9)) / 0.5, 0, 1);
  const glow = 0.35 + 0.2 * (1 + Math.sin((T / 4) * Math.PI * 2)) / 2;
  const sheenCycle = ((T - (CUES.Mascota + 1.0)) % 3.6) / 3.6;
  const sheenX = T > CUES.Mascota + 1.0 ? interpolate([0, 0.55], [-140, 240], Easing.easeInOutSine)(clamp(sheenCycle, 0, 0.55)) : -140;

  const arteS = MOTION.pop({ from: 0.3, to: 1, start: CUES.Palabras, end: CUES.Palabras + 0.55 })(T);
  const arteR = MOTION.pop({ from: 8, to: -16, start: CUES.Palabras, end: CUES.Palabras + 0.55 })(T);
  const arteO = MOTION.enter({ from: 0, to: 1, start: CUES.Palabras, end: CUES.Palabras + 0.25 })(T);
  const colS = MOTION.pop({ from: 0.3, to: 1, start: CUES.Palabras + 0.2, end: CUES.Palabras + 0.75 })(T);
  const colR = MOTION.pop({ from: 8, to: -14, start: CUES.Palabras + 0.2, end: CUES.Palabras + 0.75 })(T);
  const colO = MOTION.enter({ from: 0, to: 1, start: CUES.Palabras + 0.2, end: CUES.Palabras + 0.45 })(T);

  const loadO = MOTION.enter({ from: 0, to: 1, start: CUES.Carga, end: CUES.Carga + 0.4 })(T);
  const fill = MOTION.enter({ from: 4, to: 100, start: CUES.Carga + 0.15, end: CUES.Boton - 0.15 })(T);
  const dripCycle = ((T - (CUES.Carga + 0.6)) % 1.6) / 1.6;
  const dripOn = T > CUES.Carga + 0.6 && fill < 100;
  const dripY = dripOn ? interpolate([0, 1], [-8, 34], Easing.easeInQuad)(dripCycle) : -8;
  const dripO = dripOn ? interpolate([0, 0.25, 1], [0, 1, 0])(dripCycle) : 0;

  const btnS = MOTION.pop({ from: 0.4, to: 1, start: CUES.Boton, end: CUES.Boton + 0.55 })(T);
  const btnO = MOTION.enter({ from: 0, to: 1, start: CUES.Boton, end: CUES.Boton + 0.3 })(T);
  const btnPulse = T > CUES.Boton + 0.7 ? 1 + 0.035 * (1 + Math.sin(((T - CUES.Boton - 0.7) / 2.2) * Math.PI * 2)) / 2 : 1;

  return (
    <div style={{ position: 'absolute', inset: 0, background: YELLOW, overflow: 'hidden', fontFamily: "'Barlow Condensed', sans-serif" }}>
      <Blob T={T} x={-130} y={-120} size={290} from="#EC0C7B" to="#C2076A" opacity={0.85} phase={0} blur={26} />
      <Blob T={T} x={310} y={130} size={250} from="#2FC3C9" to="#17A8B4" opacity={0.6} phase={0.35} blur={30} />
      <Blob T={T} x={-110} y={570} size={280} from="#A45BD6" to="#7C3FB0" opacity={0.5} phase={0.6} blur={34} />
      <Blob T={T} x={330} y={520} size={180} from="#2FC3C9" to="#1B9AA6" opacity={0.45} phase={0.85} blur={28} />

      <div style={{ position: 'absolute', inset: 0, padding: '34px 30px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: content }}>
        <img src="assets/logo.png" alt="Pinturas Tito Pabón" style={{
          width: 150, height: 'auto', opacity: logoO,
          filter: 'drop-shadow(0 6px 10px rgba(150,90,0,.28))',
          transform: `translateY(${logoY}px) scale(${logoS})`,
        }} />

        <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontFamily: ANTON }}>
          <div style={{ fontSize: 56, lineHeight: 0.94, letterSpacing: 0.5, color: '#E4032E', opacity: l1o,
            textShadow: '0 3px 0 rgba(255,255,255,.55), 0 10px 22px rgba(196,0,40,.28)',
            transform: `translateX(${l1x}px) skewX(${l1k}deg)` }}>TU ROSTRO,</div>
          <div style={{ fontSize: 56, lineHeight: 0.94, letterSpacing: 0.5, color: '#FFFFFF', opacity: l2o,
            textShadow: '0 4px 0 #d8ab2a, 0 12px 26px rgba(120,80,0,.32)',
            transform: `translateX(${l2x}px) skewX(${l2k}deg)` }}>TU ARTE</div>
        </div>

        <div style={{ marginTop: 22, fontWeight: 800, fontSize: 25, letterSpacing: 0.6, color: '#2B2118', textTransform: 'uppercase', textAlign: 'center', opacity: subO, transform: `translateY(${subY}px)` }}>Conviértete en una obra de arte</div>

        <div style={{ position: 'relative', marginTop: 34, width: 262 }}>
          <div style={{ position: 'relative', opacity: cardO, transform: `translateY(${cardY}px) scale(${cardS})` }}>
            <div style={{ position: 'absolute', inset: -14, borderRadius: 40, background: 'radial-gradient(circle, rgba(255,255,255,.75), rgba(255,255,255,0) 68%)', opacity: glow }} />
            <div style={{ position: 'relative', borderRadius: 30, overflow: 'hidden', boxShadow: '0 22px 44px rgba(150,95,0,.3), inset 0 0 0 1px rgba(255,255,255,.45)' }}>
              <img src="assets/mascota.png" alt="Mascota Tito Pabón" style={{ display: 'block', width: '100%', height: 'auto', transform: `translateY(${bob * -9 * bobActive}px) rotate(${bob * 0.6 * bobActive}deg)` }} />
              <div style={{ position: 'absolute', top: 0, left: 0, width: '60%', height: '130%', background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.5), rgba(255,255,255,0))', transform: `translateX(${sheenX}%) rotate(18deg)` }} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 'auto', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative', width: 190, height: 9, borderRadius: 99, background: 'rgba(120,80,10,.18)', opacity: loadO }}>
            <div style={{ position: 'relative', width: `${fill}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#F7A600,#E4032E)' }}>
              <div style={{ position: 'absolute', right: -3, top: 6, width: 9, height: 12, borderRadius: '0 0 50% 50%', background: '#E4032E', opacity: dripO, transform: `translateY(${dripY}px) scaleY(1.1)` }} />
            </div>
          </div>
          <div style={{ border: 'none', padding: '16px 34px', borderRadius: 99, background: 'linear-gradient(180deg,#F2143C,#C40024)', color: '#fff', fontFamily: ANTON, fontSize: 22, letterSpacing: 1.6, textTransform: 'uppercase', boxShadow: '0 10px 0 #8E0019, 0 18px 30px rgba(140,0,25,.32)', opacity: btnO, transform: `scale(${btnS * btnPulse})` }}>Toca para comenzar</div>
        </div>

        <div style={{ position: 'absolute', left: 14, top: 357, fontFamily: ANTON, fontSize: 29, color: '#1FB6C4', textShadow: '0 2px 0 rgba(255,255,255,.5)', opacity: arteO, transform: `scale(${arteS}) rotate(${arteR}deg)` }}>ARTE</div>
        <div style={{ position: 'absolute', left: 367, top: 437, fontFamily: ANTON, fontSize: 29, color: '#F0369A', textShadow: '0 2px 0 rgba(255,255,255,.5)', opacity: colO, transform: `scale(${colS}) rotate(${colR}deg)` }}>COLOR</div>
      </div>
    </div>
  );
}

window.SplashVideo = SplashVideo;
