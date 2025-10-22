"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaImages, FaTag, FaBars, FaTimes } from "react-icons/fa";
import { useState } from "react";

const Sidebar = () => {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { name: "ImageView", href: "/admin/imageview", icon: FaImages },
    { name: "Brand", href: "/admin/brand", icon: FaTag },
  ];

  const toggleMobileMenu = () => setIsMobileMenuOpen((v) => !v);

  return (
    <>
      {/* Botón hamburguesa (solo mobile) */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        onClick={toggleMobileMenu}
        aria-label={isMobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
      >
        {isMobileMenuOpen ? <FaTimes className="h-6 w-6" /> : <FaBars className="h-6 w-6" />}
      </button>

      {/* Sidebar fija */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-screen
          w-64 md:w-48 lg:w-64
          bg-gray-800 text-white flex flex-col
          transition-transform duration-300 ease-in-out
          ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
          shadow-lg
        `}
      >
        <div className="p-4 text-lg md:text-base lg:text-xl font-bold border-b border-gray-700">
          Admin Panel
        </div>
        <nav className="flex-1 p-4">
          <ul>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <li key={item.name} className="mb-2">
                  <Link
                    href={item.href}
                    className={`
                      flex items-center p-2 rounded-lg hover:bg-gray-700 transition-colors
                      text-sm md:text-sm lg:text-base
                      ${isActive ? "bg-gray-700 font-semibold" : ""}
                    `}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <Icon className="w-5 h-5 md:w-4 md:h-4 lg:w-5 lg:h-5 mr-3" />
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Overlay mobile */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-30"
          onClick={toggleMobileMenu}
          aria-hidden="true"
        />
      )}
    </>
  );
};

export default Sidebar;
