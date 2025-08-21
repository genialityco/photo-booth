export default function LoadingView() {
    return (
        <div className="flex items-center justify-center h-screen">
            <div className="relative" style={{ width: 400, height: 400 }}>
                {/* Spinner fondo */}
                <img
                    src="/images/LOADING.png"
                    alt="Spinner"
                    className="absolute top-0 left-0 w-full h-full object-contain animate-spin-slow"
                    style={{ zIndex: 0 }}
                />
                {/* Átomo centrado y proporcional */}
                <img
                    src="/images/atom.gif"
                    alt="Cargando..."
                    className="absolute top-1/2 left-1/2 object-contain"
                    style={{ width: '60%', height: '60%', transform: 'translate(-50%, -50%)', zIndex: 1 }}
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
        </div>
    );
}
