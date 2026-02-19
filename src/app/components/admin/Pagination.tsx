import React from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalElements: number;
  pageSize: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  className?: string;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalElements,
  pageSize,
  isLoading,
  onPageChange,
  className = "",
}) => {
  const renderPaginationNumbers = () => {
    if (totalPages <= 1) return null;

    const pages = [];
    let startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);

    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }

    if (startPage > 1) {
      pages.push(
        <button
          key={1}
          onClick={() => onPageChange(1)}
          disabled={isLoading}
          className="px-3 py-2 mx-1 rounded-md text-sm font-medium bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
        >
          1
        </button>
      );
      if (startPage > 2) {
        pages.push(<span key="ellipsis1" className="px-2 text-gray-500">...</span>);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => onPageChange(i)}
          disabled={isLoading || i === currentPage}
          className={`px-3 py-2 mx-1 rounded-md text-sm font-medium transition-colors ${
            i === currentPage
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400"
          }`}
        >
          {i}
        </button>
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push(<span key="ellipsis2" className="px-2 text-gray-500">...</span>);
      }
      pages.push(
        <button
          key={totalPages}
          onClick={() => onPageChange(totalPages)}
          disabled={isLoading}
          className="px-3 py-2 mx-1 rounded-md text-sm font-medium bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
        >
          {totalPages}
        </button>
      );
    }

    return pages;
  };

  const startElement = (currentPage - 1) * pageSize + 1;
  const endElement = Math.min(currentPage * pageSize, totalElements);

  if (totalPages <= 1) return null;

  return (
    <div className={`mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 ${className}`}>
      <div className="text-sm text-gray-700">
        <span>Página {currentPage} de {totalPages}</span>
        {totalElements > 0 && (
          <>
            <span className="ml-2">• {totalElements} elementos</span>
            <span className="ml-2">• Mostrando {startElement}-{endElement}</span>
          </>
        )}
      </div>

      <div className="flex items-center space-x-2">
        {/* Botón Anterior */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || isLoading}
          className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
        >
          {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ChevronLeft className="h-4 w-4 mr-2" />}
          Anterior
        </button>

        {/* Números de página */}
        <div className="hidden md:flex">{renderPaginationNumbers()}</div>

        {/* Input para móvil */}
        <div className="flex md:hidden items-center space-x-2">
          <input
            type="number"
            min={1}
            max={totalPages}
            value={currentPage}
            onChange={(e) => {
              const page = parseInt(e.target.value);
              if (page >= 1 && page <= totalPages && !isNaN(page)) {
                onPageChange(page);
              }
            }}
            className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-md text-center"
            disabled={isLoading}
          />
          <span className="text-sm text-gray-500">de {totalPages}</span>
        </div>

        {/* Botón Siguiente */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || isLoading}
          className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
        >
          Siguiente
          {isLoading ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <ChevronRight className="h-4 w-4 ml-2" />}
        </button>
      </div>
    </div>
  );
};

export default Pagination;
