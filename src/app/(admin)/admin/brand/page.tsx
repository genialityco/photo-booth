/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect, useState } from "react";
import { QueryDocumentSnapshot } from "firebase/firestore";
import {
  createPhotoBoothPrompt,
  deletePhotoBoothPrompt,
  getPhotoBoothPrompts,
  PhotoBoothPrompt,
  updatePhotoBoothPrompt,
} from "@/app/services/photo-booth/brandService";
import Modal from "@/app/components/admin/Modal";
import Form from "@/app/components/admin/Form";
import { Edit, Link, Trash } from "lucide-react";
import DataTable from "@/app/components/admin/DataTable";
import Pagination from "@/app/components/admin/Pagination";
import { useRouter } from "next/navigation";

const columns = [
  {
    key: "brand",
    label: "Brand",
    sortable: true,
    render: (item: PhotoBoothPrompt, value: string) => <strong>{value}</strong>,
  },
  {
    key: "basePrompt",
    label: "Prompt",
    sortable: false,
    className: "truncate w-fit max-w-md",
    render: (item: PhotoBoothPrompt, value: string) => value,
  },
  {
    key: "colorDirectiveTemplate",
    label: "Color Template",
    sortable: false,
    render: (item: PhotoBoothPrompt, value: string) => value,
  },
  {
    key: "active",
    label: "Activo",
    sortable: false,
    render: (item: PhotoBoothPrompt, value: boolean) => (value ? "Sí" : "No"),
  },
];

interface PaginationState {
  currentPage: number;
  totalPages: number | null;
  pages: Array<{
    pageNumber: number;
    lastDoc: QueryDocumentSnapshot | null;
  }>;
}


export default function PhotoBoothPromptsPage() {
  const [prompts, setPrompts] = useState<PhotoBoothPrompt[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<PhotoBoothPrompt | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    totalPages: null,
    pages: [{ pageNumber: 1, lastDoc: null }],
  });

  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalElements, setTotalElements] = useState<number>(0);
  const pageSize = 10;

  const loadPrompts = async (
    lastDocParam: QueryDocumentSnapshot | null = null,
    pageNumber: number = 1
  ) => {
    setIsLoading(true);
    try {
      const result = await getPhotoBoothPrompts(pageSize, lastDocParam);
      setPrompts(result.data);
      const totalElements = result.total || 0;
      const calculatedTotalPages = Math.ceil(totalElements / pageSize);

      setTotalPages(calculatedTotalPages);
      setTotalElements(totalElements);

      setPagination(prev => {
        const newPages = [...prev.pages];
        const pageIndex = newPages.findIndex(p => p.pageNumber === pageNumber);

        if (pageIndex >= 0) {
          newPages[pageIndex] = {
            pageNumber,
            lastDoc: result.lastDoc,
          };
        } else if (result.hasNext && pageNumber < calculatedTotalPages) {
          newPages.push({
            pageNumber: pageNumber + 1,
            lastDoc: null,
          });
        }

        return {
          ...prev,
          currentPage: pageNumber,
          totalPages: calculatedTotalPages,
          pages: newPages,
        };
      });

      console.log("Loaded prompts:", result.data);
      return result;
    } catch (error) {
      console.error("Error loading prompts:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPrompts();
  }, []);

  const handleGoToPage = async (pageNumber: number) => {
    if (pageNumber === pagination.currentPage || pageNumber < 1 || pageNumber > totalPages) return;

    // Si ya tenemos el cursor para la página anterior, usarlo. Si no, avanzar secuencialmente
    try {
      // Find the highest known page < requested that has a lastDoc
      const knownPages = pagination.pages.filter(p => p.pageNumber < pageNumber);
      const knownWithCursor = [...knownPages].reverse().find(p => p.lastDoc);

      let startPage = 1;
      let lastDoc: QueryDocumentSnapshot | null = null;

      if (knownWithCursor) {
        startPage = knownWithCursor.pageNumber + 1;
        lastDoc = knownWithCursor.lastDoc || null;
      }

      // If we don't have any cursor and requested page is >1, we will fetch pages sequentially from page 1
      for (let p = startPage; p <= pageNumber; p++) {
        const res = await loadPrompts(lastDoc, p);
        lastDoc = res.lastDoc;
      }
    } catch (error) {
      console.error("Error navigating to page:", error);
    }
  };

  const onEdit = (prompt: PhotoBoothPrompt) => {
    //console.log("Edit prompt:", prompt);
   
    setSelectedPrompt(prompt);
    setIsModalOpen(true);
  };

  const onDelete = async (id: string) => {
    try {
      await deletePhotoBoothPrompt(id);
      const prevPageNumber = pagination.currentPage - 1;
      const prevPageInfo = pagination.pages.find(p => p.pageNumber === prevPageNumber);
      const lastDocToStartFrom = prevPageInfo?.lastDoc || null;

      // Recargar la página actual
      await loadPrompts(lastDocToStartFrom, pagination.currentPage);
    } catch (error) {
      console.error("Error deleting prompt:", error);
    }
  };

  const onCreate = () => {
    setSelectedPrompt({
      brand: "",
      brandName: "",
      basePrompt: "",
      colorDirectiveTemplate: "",
      active: false,
    } as PhotoBoothPrompt);
    setIsModalOpen(true);
  };

  const actions = [
    {
      key: "copyUrl",
      label: "Copiar URL",
      icon: <Link className="h-4 w-4" />,
      onClick: (item: any) => onCopyUrl(item),
    },
    {
      key: "edit",
      label: "Editar",
      icon: <Edit className="h-4 w-4" />,
      onClick: (item: any) => onEdit(item),
    },
    {
      key: "delete",
      label: "Eliminar",
      icon: <Trash className="h-4 w-4 hover:text-red-500" />,
      onClick: (item: any) => onDelete(item.id),
    },
  ];

  const formFields = [
    { name: "brand", label: "Brand (clave técnica)", type: "text", required: true, placeholder: "Ingresa la marca (clave)" },
    { name: "brandName", label: "Nombre para tarjetas (landing)", type: "text", required: false, placeholder: "Nombre que se mostrará en las tarjetas" },
    { name: "basePrompt", label: "Prompt", type: "textarea", required: true, placeholder: "Ingresa el prompt" },
    { name: "logoPrompt", label: "Logo Prompt", type: "textarea", required: false, placeholder: "Ingresa el prompt" },
    { name: "colorDirectiveTemplate", label: "Color Template", type: "textarea", required: true, placeholder: "Ingresa el prompt de color" },
    { name: "active", label: "Active", type: "checkbox", required: true },
    {
      name: 'logo',
      label: 'Logo',
      type: 'image',
      required: false,
      accept: 'image/png,image/jpeg',
      maxSize: 5 // 5MB máximo
    }
    ,
    {
      name: 'imageUrl',
      label: 'Imagen para cards (landing)',
      type: 'image',
      required: false,
      accept: 'image/png,image/jpeg',
      maxSize: 5
    },
    {
      name: 'promptBgImage',
      label: 'Fondo para Prompt',
      type: 'image',
      required: false,
      accept: 'image/png,image/jpeg',
      maxSize: 8
    }
  ];


  const handleSubmit = async (data: PhotoBoothPrompt) => {
    try {
      console.log("data:", data)
     
      if (data?.id) {
        await updatePhotoBoothPrompt(data.id, data);
      } else {
        await createPhotoBoothPrompt(data);
      }
      setIsModalOpen(false);

      const prevPageNumber = pagination.currentPage - 1;
      const prevPageInfo = pagination.pages.find(p => p.pageNumber === prevPageNumber);
      const lastDocToStartFrom = prevPageInfo?.lastDoc || null;

      // Recargar la página actual
      await loadPrompts(lastDocToStartFrom, pagination.currentPage);
    } catch (error) {
      console.error("Error submitting prompt:", error);
    }
  };

  const onCopyUrl = (prompt: PhotoBoothPrompt) => {
    console.log("color:", color)
    if (color) {
      window.open(`/?brand=${prompt.brand}&color=${color}`, "_blank");
    }
    else {
      window.open(`/?brand=${prompt.brand}`, "_blank");
    }
  }

  return (

    <div className="py-8">
      <input type="color" value={color || "#000000"} onChange={(e) => setColor(e.target.value)} />
      <DataTable
        data={prompts}
        columns={columns}
        actions={actions}
        searchFields={["brand", "basePrompt"]}
        title="Prompts"
        selectable
        onCreate={onCreate}
      />

      <Pagination
        totalPages={totalPages}
        totalElements={totalElements}
        pageSize={pageSize}
        isLoading={isLoading}
        onPageChange={handleGoToPage}
        currentPage={pagination.currentPage}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedPrompt?.id ? "Editar Prompt" : "Crear Prompt"}
      >
        {selectedPrompt && (
          <Form
            initialData={selectedPrompt}
            fields={formFields}
            onSubmit={handleSubmit}
            submitButtonText={selectedPrompt?.id ? "Guardar Cambios" : "Crear Prompt"}
          />
        )}
      </Modal>
    </div>
  );
}