import Sidebar from "@/app/components/admin/Sidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gray-100">
      {/* Sidebar fija (no ocupa flujo) */}
      <Sidebar />

      {/* Contenido principal: en móviles ocupa todo el ancho; en md+ deja espacio de la sidebar */}
      <main
        className="
          relative
          h-[100svh]
          overflow-y-auto overscroll-contain
          p-3 sm:p-4 md:p-6
          md:pl-48 lg:pl-64
        "
      >
        {children}
      </main>
    </div>
  );
}
