export default function LoadingScreen({ message = "Cargando..." }: { message?: string }) {
  return (
    <div 
      className="flex items-center justify-center min-h-screen w-full bg-cover bg-center"
      style={{ backgroundImage: "url('/Colombia4.0/fondoCel.png')" }}
    >
      <div className="text-white text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p>{message}</p>
      </div>
    </div>
  );
}
