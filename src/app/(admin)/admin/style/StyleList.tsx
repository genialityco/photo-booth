"use client";

import React, { useEffect, useState } from "react";
import DataTable from "@/app/home/components/admin/DataTable";
import { getStyleProfiles, StyleProfile } from "@/app/services/styleService";
import { Edit, Link, Eye } from "lucide-react";

interface Props {
  onCreate?: () => void;
  onEdit?: (item: StyleProfile) => void;
}

export default function StyleList({ onCreate, onEdit }: Props) {
  const [styles, setStyles] = useState<StyleProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await getStyleProfiles();
        if (mounted) setStyles(res);
      } catch (error) {
        console.error("Error loading style profiles:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const columns = [
    { key: "name", label: "Nombre", sortable: true },
    {
      key: "frameImage",
      label: "Marco",
      render: (_item: StyleProfile, value: string) =>
        value ? (
          <img src={value} alt="frame" className="h-12 w-12 object-contain rounded" />
        ) : (
          <span className="text-sm text-gray-500">-</span>
        ),
      className: "w-20",
    },
    {
      key: "createdAt",
      label: "Creado",
      render: (_item: StyleProfile, value: any) =>
        value ? new Date(value?.seconds ? value.seconds * 1000 : value).toLocaleString() : "-",
      sortable: true,
    },
  ];

  const actions = [
    {
      key: "view",
      label: "Ver",
      icon: <Eye className="h-4 w-4" />,
      onClick: (item: StyleProfile) => {
        if (item.frameImage) window.open(item.frameImage, "_blank");
      },
    },
    {
      key: "copy",
      label: "Copiar URL",
      icon: <Link className="h-4 w-4" />,
      onClick: (item: StyleProfile) => {
        const url = item.frameImage || "";
        if (url && navigator.clipboard) navigator.clipboard.writeText(url);
      },
    },
    {
      key: "edit",
      label: "Editar",
      icon: <Edit className="h-4 w-4" />,
      onClick: (item: StyleProfile) => onEdit?.(item),
    },
  ];

  return (
    <div>
      <DataTable
        data={styles}
        loading={loading}
        columns={columns}
        actions={actions}
        searchFields={["name"]}
        title="Perfiles de Estilo"
        showCreateButton={true}
        onCreate={onCreate}
        keyField="id"
        selectable
      />
    </div>
  );
}
