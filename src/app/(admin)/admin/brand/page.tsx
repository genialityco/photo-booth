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
} from "@/app/services/brandService";
import Modal from "@/app/home/components/admin/Modal";
import Form from "@/app/home/components/admin/Form";
import { Edit, Trash } from "lucide-react";
import DataTable from "@/app/home/components/admin/DataTable";
import Pagination from "@/app/home/components/admin/Pagination";

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
    } catch (error) {
      console.error("Error loading prompts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPrompts();
  }, []);

  const handleGoToPage = async (pageNumber: number) => {
    if (pageNumber === pagination.currentPage || pageNumber < 1 || pageNumber > totalPages) return;

    // Buscar el lastDoc de la página anterior
    const prevPageInfo = pagination.pages.find(p => p.pageNumber === pageNumber - 1);
    const lastDoc = prevPageInfo?.lastDoc || null;

    await loadPrompts(lastDoc, pageNumber);
  };

  const onEdit = (prompt: PhotoBoothPrompt) => {
    setSelectedPrompt(prompt);
    setIsModalOpen(true);
  };

  const onDelete = async (id: string) => {
    try {
      await deletePhotoBoothPrompt(id);
      const currentPageInfo = pagination.pages.find(p => p.pageNumber === pagination.currentPage);
      await loadPrompts(currentPageInfo?.lastDoc || null, pagination.currentPage);
    } catch (error) {
      console.error("Error deleting prompt:", error);
    }
  };

  const onCreate = () => {
    setSelectedPrompt({
      brand: "",
      basePrompt: "",
      colorDirectiveTemplate: "",
      active: false,
    } as PhotoBoothPrompt);
    setIsModalOpen(true);
  };

  const actions = [
    {
      key: "edit",
      label: "Editar",
      icon: <Edit className="h-4 w-4" />,
      onClick: (item: PhotoBoothPrompt) => onEdit(item),
    },
    {
      key: "delete",
      label: "Eliminar",
      icon: <Trash className="h-4 w-4 hover:text-red-500" />,
      onClick: (id: string) => onDelete(id),
    },
  ];

  const formFields = [
    { name: "brand", label: "Brand", type: "text", required: true, placeholder: "Ingresa la marca" },
    { name: "basePrompt", label: "Prompt", type: "textarea", required: true, placeholder: "Ingresa el prompt" },
    { name: "colorDirectiveTemplate", label: "Color Template", type: "textarea", required: true, placeholder: "Ingresa el prompt de color" },
    { name: "active", label: "Active", type: "checkbox", required: true },
  ];

  const handleSubmit = async (data: PhotoBoothPrompt) => {
    try {
      if (data?.id) {
        await updatePhotoBoothPrompt(data.id, data);
      } else {
        await createPhotoBoothPrompt(data);
      }
      setIsModalOpen(false);

      const currentPageInfo = pagination.pages.find(p => p.pageNumber === pagination.currentPage);
      await loadPrompts(currentPageInfo?.lastDoc || null, pagination.currentPage);
    } catch (error) {
      console.error("Error submitting prompt:", error);
    }
  };

  return (
    <div className="py-8">
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
        <Form
          initialData={selectedPrompt}
          fields={formFields}
          onSubmit={handleSubmit}
          submitButtonText={selectedPrompt?.id ? "Guardar Cambios" : "Crear Prompt"}
        />
      </Modal>
    </div>
  );
}
