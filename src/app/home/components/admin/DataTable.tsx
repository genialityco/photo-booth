/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo } from "react";
import {
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Calendar,
} from "lucide-react";

// Tipos genéricos
interface Column<T = any> {
  key: string;
  label: string;
  width?: string;
  sortable?: boolean;
  searchable?: boolean;
  render?: (item: T, value: any) => React.ReactNode;
  className?: string;
  mobileHidden?: boolean;
  tabletHidden?: boolean; // New: Flag to hide column on tablets
}

interface FilterOption {
  value: string;
  label: string;
}

interface SortOption {
  value: string;
  label: string;
  field: string;
  order: "asc" | "desc";
}

interface Action<T> {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: (item: T) => void;
  show?: (item: T) => boolean;
  className?: string;
}

interface GenericDataTableProps<T> {
  data: T[];
  loading?: boolean;
  columns: Column<T>[];
  actions?: Action<T>[];
  bulkActions?: {
    key: string;
    label: string;
    onClick: (selectedIds: string[]) => void;
    className?: string;
  }[];
  searchFields?: string[];
  filterOptions?: {
    key: string;
    label: string;
    options: FilterOption[];
    defaultValue?: string;
  }[];
  sortOptions?: SortOption[];
  keyField?: string;
  title?: string;
  description?: string;
  showCreateButton?: boolean;
  onCreate?: () => void;
  createButtonLabel?: string;
  pageSize?: number;
  className?: string;
  selectable?: boolean;
  onSelectionChange?: (selectedIds: string[]) => void;
  emptyMessage?: string;
  noResultsMessage?: string;
  loadingMessage?: string;
}

export default function GenericDataTable<T = any>({
  data = [],
  loading = false,
  columns = [],
  actions = [],
  bulkActions = [],
  searchFields = [],
  filterOptions = [],
  sortOptions = [],
  keyField = "id",
  title,
  description,
  showCreateButton = true,
  onCreate,
  createButtonLabel = "Nuevo",
  pageSize = 10,
  className = "",
  selectable = false,
  onSelectionChange,
  emptyMessage = "No hay datos disponibles",
  noResultsMessage = "No se encontraron resultados con los filtros aplicados",
  loadingMessage = "Cargando datos...",
}: GenericDataTableProps<T>) {
  // Estados
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState<string>(sortOptions[0]?.field || "");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(
    sortOptions[0]?.order || "desc"
  );
  const [expandedRows, setExpandedRows] = useState<string[]>([]); // New: Track expanded rows for mobile

  // Helper functions
  const getNestedValue = (obj: any, path: string): any => {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  };

  const renderBoolean = (
    value: boolean | null | undefined
  ): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-gray-500">-</span>;
    }
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          value ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
        }`}
      >
        {value ? (
          <>
            <Check className="h-3 w-3 mr-1" />
            Activo
          </>
        ) : (
          <>
            <X className="h-3 w-3 mr-1" />
            Inactivo
          </>
        )}
      </span>
    );
  };

  const truncateText = (text: string, maxLength: number = 30): string => {
    return text && text.length > maxLength
      ? text.substring(0, maxLength) + "..."
      : text || "";
  };

  const filteredAndSortedData = useMemo(() => {
    let filtered = [...data];
    if (searchTerm && searchFields.length > 0) {
      filtered = filtered.filter((item) =>
        searchFields.some((field) => {
          const value = getNestedValue(item, field);
          return String(value || "")
            .toLowerCase()
            .includes(searchTerm.toLowerCase());
        })
      );
    }
    Object.entries(filters).forEach(([filterKey, filterValue]) => {
      if (filterValue && filterValue !== "all") {
        filtered = filtered.filter((item) => {
          const itemValue = getNestedValue(item, filterKey);
          if (filterValue === "true" || filterValue === "false") {
            return String(itemValue) === filterValue;
          }
          return String(itemValue) === filterValue;
        });
      }
    });
    if (sortBy) {
      filtered.sort((a, b) => {
        const valueA = getNestedValue(a, sortBy);
        const valueB = getNestedValue(b, sortBy);
        let comparison = 0;
        if (valueA instanceof Date && valueB instanceof Date) {
          comparison = valueA.getTime() - valueB.getTime();
        } else if (typeof valueA === "number" && typeof valueB === "number") {
          comparison = valueA - valueB;
        } else {
          comparison = String(valueA || "").localeCompare(String(valueB || ""));
        }
        return sortOrder === "asc" ? comparison : -comparison;
      });
    }
    return filtered;
  }, [data, searchTerm, searchFields, filters, sortBy, sortOrder]);

  const totalPages = Math.ceil(filteredAndSortedData.length / pageSize);
  const paginatedData = filteredAndSortedData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters]);

  React.useEffect(() => {
    setSelectedItems([]);
  }, [data]);

  React.useEffect(() => {
    onSelectionChange?.(selectedItems);
  }, [selectedItems, onSelectionChange]);

  const handleSelectAll = () => {
    if (selectedItems.length === paginatedData.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(
        paginatedData.map((item) => String(getNestedValue(item, keyField)))
      );
    }
  };

  const handleSelectItem = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  const handleFilterChange = (filterKey: string, value: string) => {
    setFilters((prev) => ({ ...prev, [filterKey]: value }));
  };

  const handleSortChange = (value: string) => {
    const sortOption = sortOptions.find((option) => option.value === value);
    if (sortOption) {
      setSortBy(sortOption.field);
      setSortOrder(sortOption.order);
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilters({});
    if (sortOptions[0]) {
      setSortBy(sortOptions[0].field);
      setSortOrder(sortOptions[0].order);
    }
  };

  const formatDate = (date: Date | string | null): string => {
    if (!date) return "-";
    const dateObj = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(dateObj);
  };

  const toggleRowExpansion = (id: string) => {
    setExpandedRows((prev) =>
      prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id]
    );
  };

  return (
    <div
      className={`bg-white rounded-lg text-gray-900 shadow-sm border border-gray-200 ${className}`}
    >
      {/* Header con controles */}
      {(title || description || showCreateButton) && (
        <div className="p-4 md:p-5 lg:p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {(title || description) && (
              <div>
                {title && (
                  <h2 className="text-lg md:text-xl font-semibold text-gray-900">
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="text-sm text-gray-500 mt-1">{description}</p>
                )}
              </div>
            )}
            {showCreateButton && onCreate && (
              <button
                onClick={onCreate}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm md:text-base"
              >
                <Plus className="h-4 w-4 mr-2" />
                {createButtonLabel}
              </button>
            )}
          </div>

          {/* Controles de filtros */}
          {(searchFields.length > 0 ||
            filterOptions.length > 0 ||
            sortOptions.length > 0) && (
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 md:gap-4 mt-4">
              {searchFields.length > 0 && (
                <div className="relative flex-1 max-w-full sm:max-w-md">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              )}
              {filterOptions.map((filter) => (
                <select
                  key={filter.key}
                  value={filters[filter.key] || filter.defaultValue || "all"}
                  onChange={(e) =>
                    handleFilterChange(filter.key, e.target.value)
                  }
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm w-full sm:w-auto"
                >
                  {filter.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ))}
              {sortOptions.length > 0 && (
                <select
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => handleSortChange(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm w-full sm:w-auto"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Acciones en lote */}
          {selectable && selectedItems.length > 0 && bulkActions.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center gap-2 mt-4 p-3 bg-blue-50 rounded-lg">
              <span className="text-sm text-blue-700">
                {selectedItems.length} elemento(s) seleccionado(s)
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                {bulkActions.map((action) => (
                  <button
                    key={action.key}
                    onClick={() => action.onClick(selectedItems)}
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      action.className ||
                      "bg-red-600 text-white hover:bg-red-700"
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile: Card layout (<768px) */}
      <div className="block md:hidden p-4 space-y-4">
        {loading ? (
          <div className="text-center text-gray-500">
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
            <p className="mt-2">{loadingMessage}</p>
          </div>
        ) : paginatedData.length === 0 ? (
          <div className="text-center text-gray-500">
            {data.length === 0 ? (
              <div>
                <p>{emptyMessage}</p>
                {showCreateButton && onCreate && (
                  <button
                    onClick={onCreate}
                    className="mt-2 text-blue-600 hover:text-blue-500"
                  >
                    Crear el primer elemento
                  </button>
                )}
              </div>
            ) : (
              <div>
                <p>{noResultsMessage}</p>
                <button
                  onClick={clearFilters}
                  className="mt-2 text-blue-600 hover:text-blue-500"
                >
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
        ) : (
          paginatedData.map((item) => {
            const itemId = String(getNestedValue(item, keyField));
            const isExpanded = expandedRows.includes(itemId);
            return (
              <div
                key={itemId}
                className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm"
              >
                {selectable && (
                  <div className="flex items-center mb-3">
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(itemId)}
                      onChange={() => handleSelectItem(itemId)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-5 w-5"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  {columns
                    .filter((column) => !column.mobileHidden)
                    .map((column) => {
                      const value = getNestedValue(item, column.key);
                      const isLongText =
                        typeof value === "string" &&
                        value.length > 30 &&
                        !isExpanded;
                      return (
                        <div key={column.key} className="flex flex-col">
                          <span className="text-xs font-medium text-gray-500">
                            {column.label}
                          </span>
                          <div className="text-sm text-gray-900">
                            {column.render ? (
                              column.render(item, value)
                            ) : value instanceof Date ? (
                              formatDate(value)
                            ) : typeof value === "boolean" ? (
                              renderBoolean(value)
                            ) : typeof value === "string" ? (
                              <div>
                                <div>
                                  {isLongText ? truncateText(value, 30) : value}
                                </div>
                                {value.length > 30 && (
                                  <button
                                    onClick={() => toggleRowExpansion(itemId)}
                                    className="text-xs text-blue-600 hover:text-blue-500 mt-1"
                                  >
                                    {isExpanded ? "Ver menos" : "Ver más"}
                                  </button>
                                )}
                              </div>
                            ) : value !== null && value !== undefined ? (
                              String(value)
                            ) : (
                              "-"
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
                {actions.length > 0 && (
                  <div className="flex justify-end gap-2 mt-3">
                    {actions.map((action) => {
                      if (action.show && !action.show(item)) return null;
                      return (
                        <button
                          key={action.key}
                          onClick={() => action.onClick(item)}
                          className={`p-2 transition-colors ${
                            action.className ||
                            "text-gray-400 hover:text-blue-600"
                          }`}
                          title={action.label}
                        >
                          {action.icon || <Edit className="h-5 w-5" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Tablet: Simplified table (768px–1023px) */}
      <div className="hidden md:block lg:hidden overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {selectable && (
                <th className="w-12 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={
                      selectedItems.length === paginatedData.length &&
                      paginatedData.length > 0
                    }
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-5 w-5"
                  />
                </th>
              )}
              {columns
                .filter(
                  (column) => !column.tabletHidden && !column.mobileHidden
                )
                .map((column) => (
                  <th
                    key={column.key}
                    className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                      column.width || ""
                    } ${column.className || ""}`}
                  >
                    {column.label}
                  </th>
                ))}
              {actions.length > 0 && (
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td
                  colSpan={
                    columns.filter((c) => !c.tabletHidden && !c.mobileHidden)
                      .length +
                    (selectable ? 1 : 0) +
                    (actions.length > 0 ? 1 : 0)
                  }
                  className="px-4 py-8 text-center text-gray-500"
                >
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                  <p className="mt-2">{loadingMessage}</p>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    columns.filter((c) => !c.tabletHidden && !c.mobileHidden)
                      .length +
                    (selectable ? 1 : 0) +
                    (actions.length > 0 ? 1 : 0)
                  }
                  className="px-4 py-8 text-center text-gray-500"
                >
                  {data.length === 0 ? (
                    <div>
                      <p>{emptyMessage}</p>
                      {showCreateButton && onCreate && (
                        <button
                          onClick={onCreate}
                          className="mt-2 text-blue-600 hover:text-blue-500"
                        >
                          Crear el primer elemento
                        </button>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p>{noResultsMessage}</p>
                      <button
                        onClick={clearFilters}
                        className="mt-2 text-blue-600 hover:text-blue-500"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              paginatedData.map((item) => {
                const itemId = String(getNestedValue(item, keyField));
                return (
                  <tr key={itemId} className="hover:bg-gray-50">
                    {selectable && (
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedItems.includes(itemId)}
                          onChange={() => handleSelectItem(itemId)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-5 w-5"
                        />
                      </td>
                    )}
                    {columns
                      .filter(
                        (column) => !column.tabletHidden && !column.mobileHidden
                      )
                      .map((column) => {
                        const value = getNestedValue(item, column.key);
                        return (
                          <td
                            key={column.key}
                            className={`px-4 py-4 ${column.className || ""}`}
                          >
                            {column.render ? (
                              column.render(item, value)
                            ) : (
                              <div className="text-sm text-gray-900">
                                {value instanceof Date ? (
                                  formatDate(value)
                                ) : typeof value === "boolean" ? (
                                  renderBoolean(value)
                                ) : typeof value === "string" &&
                                  value.length > 30 ? (
                                  <div>
                                    <div>{truncateText(value, 30)}</div>
                                    <div
                                      className="text-xs text-gray-500 mt-1"
                                      title={value}
                                    >
                                      Ver completo...
                                    </div>
                                  </div>
                                ) : value !== null && value !== undefined ? (
                                  String(value)
                                ) : (
                                  "-"
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    {actions.length > 0 && (
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {actions.map((action) => {
                            if (action.show && !action.show(item)) return null;
                            return (
                              <button
                                key={action.key}
                                onClick={() => action.onClick(item)}
                                className={`p-2 transition-colors ${
                                  action.className ||
                                  "text-gray-400 hover:text-blue-600"
                                }`}
                                title={action.label}
                              >
                                {action.icon || <Edit className="h-5 w-5" />}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Desktop: Full table (≥1024px) */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {selectable && (
                <th className="w-12 px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={
                      selectedItems.length === paginatedData.length &&
                      paginatedData.length > 0
                    }
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-5 w-5"
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    column.width || ""
                  } ${column.className || ""}`}
                >
                  {column.label}
                </th>
              ))}
              {actions.length > 0 && (
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td
                  colSpan={
                    columns.length +
                    (selectable ? 1 : 0) +
                    (actions.length > 0 ? 1 : 0)
                  }
                  className="px-6 py-8 text-center text-gray-500"
                >
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                  <p className="mt-2">{loadingMessage}</p>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    columns.length +
                    (selectable ? 1 : 0) +
                    (actions.length > 0 ? 1 : 0)
                  }
                  className="px-6 py-8 text-center text-gray-500"
                >
                  {data.length === 0 ? (
                    <div>
                      <p>{emptyMessage}</p>
                      {showCreateButton && onCreate && (
                        <button
                          onClick={onCreate}
                          className="mt-2 text-blue-600 hover:text-blue-500"
                        >
                          Crear el primer elemento
                        </button>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p>{noResultsMessage}</p>
                      <button
                        onClick={clearFilters}
                        className="mt-2 text-blue-600 hover:text-blue-500"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              paginatedData.map((item) => {
                const itemId = String(getNestedValue(item, keyField));
                return (
                  <tr key={itemId} className="hover:bg-gray-50">
                    {selectable && (
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedItems.includes(itemId)}
                          onChange={() => handleSelectItem(itemId)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-5 w-5"
                        />
                      </td>
                    )}
                    {columns.map((column) => {
                      const value = getNestedValue(item, column.key);
                      return (
                        <td
                          key={column.key}
                          className={`px-6 py-4 ${column.className || ""}`}
                        >
                          {column.render ? (
                            column.render(item, value)
                          ) : (
                            <div className="text-sm text-gray-900">
                              {value instanceof Date ? (
                                formatDate(value)
                              ) : typeof value === "boolean" ? (
                                renderBoolean(value)
                              ) : typeof value === "string" &&
                                value.length > 50 ? (
                                <div>
                                  <div>{truncateText(value, 50)}</div>
                                  <div
                                    className="text-xs text-gray-500 mt-1"
                                    title={value}
                                  >
                                    Ver completo...
                                  </div>
                                </div>
                              ) : value !== null && value !== undefined ? (
                                String(value)
                              ) : (
                                "-"
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    {actions.length > 0 && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {actions.map((action) => {
                            if (action.show && !action.show(item)) return null;
                            return (
                              <button
                                key={action.key}
                                onClick={() => action.onClick(item)}
                                className={`p-2 transition-colors ${
                                  action.className ||
                                  "text-gray-400 hover:text-blue-600"
                                }`}
                                title={action.label}
                              >
                                {action.icon || <Edit className="h-5 w-5" />}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="px-4 md:px-5 lg:px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-500 text-center sm:text-left">
            Mostrando {(currentPage - 1) * pageSize + 1} a{" "}
            {Math.min(currentPage * pageSize, filteredAndSortedData.length)} de{" "}
            {filteredAndSortedData.length} resultados
          </div>

          <div className="flex items-center gap-2 justify-center">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page;
                if (totalPages <= 5) {
                  page = i + 1;
                } else if (currentPage <= 3) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  page = totalPages - 4 + i;
                } else {
                  page = currentPage - 2 + i;
                }

                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      currentPage === page
                        ? "bg-blue-600 text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
