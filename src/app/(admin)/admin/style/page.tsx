/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import DataTable from "@/app/components/admin/DataTable";
import Modal from "@/app/components/admin/Modal";
import Form from "@/app/components/admin/Form";
import {
  createStyleProfile,
  getStyleProfiles,
  updateStyleProfile,
  deleteStyleProfile,
  type StyleProfile,
} from "@/app/services/admin/styleService";
import { getActivePhotoBoothPrompts } from "@/app/services/photo-booth/brandService";
import { Edit, Link, Trash, Eye } from "lucide-react";

export default function StyleAdminPage() {
  const [styles, setStyles] = useState<StyleProfile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<Partial<StyleProfile> | null>(null);

  const fields = [
    { name: "name", label: "Nombre del perfil", type: "text", required: true },
    { name: "bgLanding", label: "Fondo Landing", type: "image", required: false, accept: "image/*", maxSize: 8 },
    { name: "bgCapture", label: "Fondo Captura", type: "image", required: false, accept: "image/*", maxSize: 8 },
    { name: "bgLoading", label: "Fondo Loading", type: "image", required: false, accept: "image/*", maxSize: 8 },
    { name: "bgResults", label: "Fondo Resultados", type: "image", required: false, accept: "image/*", maxSize: 8 },
    { name: "logoLandingTop", label: "Logo superior - Landing", type: "image", required: false, accept: "image/*", maxSize: 5 },
    { name: "logoLandingBottom", label: "Logo inferior - Landing", type: "image", required: false, accept: "image/*", maxSize: 5 },
    { name: "logoCaptureTop", label: "Logo superior - Captura", type: "image", required: false, accept: "image/*", maxSize: 5 },
    { name: "logoCaptureBottom", label: "Logo inferior - Captura", type: "image", required: false, accept: "image/*", maxSize: 5 },
    { name: "logoLoadingTop", label: "Logo superior - Loading", type: "image", required: false, accept: "image/*", maxSize: 5 },
    { name: "logoLoadingBottom", label: "Logo inferior - Loading", type: "image", required: false, accept: "image/*", maxSize: 5 },
    { name: "logoResultsTop", label: "Logo superior - Resultados", type: "image", required: false, accept: "image/*", maxSize: 5 },
    { name: "logoResultsBottom", label: "Logo inferior - Resultados", type: "image", required: false, accept: "image/*", maxSize: 5 },
    { name: "frameImage", label: "Imagen de marco", type: "image", required: false, accept: "image/*", maxSize: 8 },
    { name: "enableFrame", label: "Habilitar marco", type: "checkbox", required: false },
  ];

  const loadStyles = async () => {
    setIsLoading(true);
    try {
      const res = await getStyleProfiles();
      setStyles(res);
    } catch (error) {
      console.error("Error loading styles:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStyles();
  }, []);

  useEffect(() => {
    if (selectedStyle) {
      const b = selectedStyle.brands || [];
      setSelectedBrands(Array.isArray(b) ? b : []);
    } else {
      setSelectedBrands([]);
    }
  }, [selectedStyle]);

  const onCreate = () => {
    setSelectedStyle({ name: "" });
    setIsModalOpen(true);
  };

  const [brandsList, setBrandsList] = useState<Array<{ id: string; brand: string }>>([]);
  const [brandSearch, setBrandSearch] = useState("");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);

  useEffect(() => {
    const loadBrands = async () => {
      try {
        const res = await getActivePhotoBoothPrompts();
        setBrandsList(res.data.map(b => ({ id: b.id, brand: b.brand || b.id })));
      } catch (err) {
        console.error('Error loading brands for selector', err);
      }
    };
    loadBrands();
  }, []);

  const onEdit = (item: StyleProfile) => {
    setSelectedStyle(item);
    setIsModalOpen(true);
  };


  const onDelete = async (id: string) => {
    if (!confirm("¿Eliminar este perfil de estilo?")) return;
    try {
      await deleteStyleProfile(id);
      await loadStyles();
    } catch (error) {
      console.error("Error deleting style:", error);
    }
  };

  const handleSubmit = async (data: any) => {
    try {
      const payload = { ...data, brands: selectedBrands };
      if (selectedStyle?.id) {
        await updateStyleProfile(selectedStyle.id as string, payload);
      } else {
        await createStyleProfile(payload);
      }
      setIsModalOpen(false);
      setSelectedStyle(null);
      await loadStyles();
    } catch (error) {
      console.error("Error saving style:", error);
      throw error;
    }
  };

  const columns = [
    { key: "name", label: "Nombre", sortable: true, render: (item: StyleProfile, value: string) => <strong>{value}</strong> },
    { key: "frameImage", label: "Imagen Marco", render: (item: StyleProfile, value: string) => value ? <img src={value} alt="frame" className="h-12 w-12 object-contain rounded" /> : <span className="text-sm text-gray-500">-</span>, className: "w-20" },
    { key: "enableFrame", label: "Marco activo", render: (item: StyleProfile, value: boolean) => value ? <span className="text-xs inline-flex items-center px-2 py-1 bg-green-600 text-white rounded">Sí</span> : <span className="text-xs inline-flex items-center px-2 py-1 bg-gray-400 text-white rounded">No</span>, className: "w-24" },
    { key: "createdAt", label: "Creado", render: (item: StyleProfile, value: any) => value ? new Date(value?.seconds ? value.seconds * 1000 : value).toLocaleString() : "-", sortable: true },
  ];

  const actions = [
    { key: "view", label: "Ver", icon: <Eye className="h-4 w-4" />, onClick: (item: StyleProfile) => { if (item.frameImage) window.open(item.frameImage, "_blank"); } },
    
    { key: "openStyle", label: "Abrir con style", icon: <Link className="h-4 w-4" />, onClick: (item: StyleProfile) => { const base = `${window.location.origin}`; window.open(`${base}?styleId=${item.id}`, "_blank"); } },
    { key: "edit", label: "Editar", icon: <Edit className="h-4 w-4" />, onClick: (item: StyleProfile) => onEdit(item) },
    { key: "delete", label: "Eliminar", icon: <Trash className="h-4 w-4 text-red-500" />, onClick: (item: StyleProfile) => onDelete(item.id) },
  ];

  return (
    <div className="py-8">
      <div className="mb-4 flex justify-end">
        <button onClick={onCreate} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Crear Estilo</button>
      </div>

      <DataTable data={styles} columns={columns} actions={actions} searchFields={["name"]} title="Perfiles de Estilo" selectable onCreate={onCreate} />

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setSelectedStyle(null); setSelectedBrands([]); }} title={selectedStyle?.id ? "Editar Estilo" : "Crear Estilo"}>
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700">Asociar Brands</label>
          <input
            type="text"
            placeholder="Buscar brands..."
            value={brandSearch}
            onChange={(e) => setBrandSearch(e.target.value)}
            className="mt-2 mb-2 w-full border border-gray-300 rounded-md p-2 text-sm"
          />
          <div className="max-h-40 overflow-y-auto border rounded p-2">
            {brandsList.filter(b => b.brand.toLowerCase().includes(brandSearch.toLowerCase())).map(b => (
              <label key={b.id} className="flex items-center gap-2 mb-1">
                <input type="checkbox" checked={selectedBrands.includes(b.id)} onChange={(e) => {
                  if (e.target.checked) setSelectedBrands(prev => [...prev, b.id]);
                  else setSelectedBrands(prev => prev.filter(x => x !== b.id));
                }} />
                <span className="text-sm">{b.brand}</span>
              </label>
            ))}
            {brandsList.length === 0 && <div className="text-sm text-gray-500">No hay brands</div>}
          </div>
        </div>

        <Form initialData={selectedStyle || {}} fields={fields} onSubmit={async (formData) => await handleSubmit(formData)} submitButtonText={selectedStyle?.id ? "Guardar Cambios" : "Crear Estilo"} />
      </Modal>
    </div>
  );
}
