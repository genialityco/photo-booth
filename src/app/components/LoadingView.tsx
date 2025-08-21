export default function LoadingView() {
    return (
        <div className="flex items-center justify-center h-screen relative">
            {/* Fondo: Spinner grande con animación */}
            <img
                src="/images/LOADING.png"
                alt="Spinner"
                className="absolute w-[500px] h-[500px] object-contain animate-spin-slow"
                style={{ zIndex: 0 }}
            />
            {/* Gif encima */}
            <img
                src="/images/atom.gif"
                alt="Cargando..."
                className="relative w-20 h-20"
                style={{ zIndex: 1 }}
            />
            <style jsx>{`
                @keyframes spin-slow {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .animate-spin-slow {
                    animation: spin-slow 2s linear infinite;
                }
            `}</style>
        </div>
    );
}
