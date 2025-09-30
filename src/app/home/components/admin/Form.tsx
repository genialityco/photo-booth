/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef, useMemo } from 'react';

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'email' | 'checkbox' | 'image' | string;
  required?: boolean;
  placeholder?: string;
  accept?: string; // For image field, e.g., "image/*" or "image/png,image/jpeg"
  maxSize?: number; // Max file size in MB
}

interface FormProps<T> {
  initialData: any;
  fields: FormField[];
  onSubmit: (data: any, updatedImages: string[]) => Promise<void>;
  submitButtonText?: string;
}

export default function Form<T extends Record<string, any>>({
  initialData,
  fields,
  onSubmit,
  submitButtonText = 'Guardar',
}: FormProps<T>) {
  const [formData, setFormData] = useState<T>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [imageUpdated, setImageUpdated] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const initialDataRef = useRef<T>(initialData);


  // Memoize image fields to prevent recalculation
  const imageFields = useMemo(() => 
    fields.filter(f => f.type === 'image'),
    [fields]
  );

  // Update formData when initialData changes
  useEffect(() => {
    setFormData(initialData);
    initialDataRef.current = initialData;
  }, [initialData]);

  // Separate effect for image previews to avoid re-triggering
  useEffect(() => {
    const previews: Record<string, string> = {};
    const updated: Record<string, boolean> = {};
    
    imageFields.forEach((field) => {
      if (initialData[field.name]) {
        previews[field.name] = initialData[field.name];
        updated[field.name] = false;
      }
    });
    
    if (Object.keys(previews).length > 0) {
      setImagePreviews(previews);
      setImageUpdated(updated);
    }
  }, []); // Solo ejecutar en el montaje inicial // Removed fields from dependencies to avoid unnecessary re-renders

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    fieldName: string
  ) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));

    // Clear error for this field when user interacts
    if (errors[fieldName]) {
      setErrors((prev) => ({
        ...prev,
        [fieldName]: '',
      }));
    }
  };

  const handleImageChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    fieldName: string,
    maxSize?: number
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (maxSize && file.size > maxSize * 1024 * 1024) {
      setErrors((prev) => ({
        ...prev,
        [fieldName]: `El archivo debe ser menor a ${maxSize}MB`,
      }));
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setImagePreviews((prev) => ({
        ...prev,
        [fieldName]: result,
      }));
      setFormData((prev) => ({
        ...prev,
        [fieldName]: result, // Store base64 string
      }));
      // Mark image as updated
      setImageUpdated((prev) => ({
        ...prev,
        [fieldName]: result !== initialDataRef.current[fieldName],
      }));
    };
    reader.readAsDataURL(file);

    // Clear error
    if (errors[fieldName]) {
      setErrors((prev) => ({
        ...prev,
        [fieldName]: '',
      }));
    }
  };

  const handleRemoveImage = (fieldName: string) => {
    setImagePreviews((prev) => {
      const newPreviews = { ...prev };
      delete newPreviews[fieldName];
      return newPreviews;
    });
    setFormData((prev) => ({
      ...prev,
      [fieldName]: null,
    }));
    // Mark as updated if there was an initial image
    setImageUpdated((prev) => ({
      ...prev,
      [fieldName]: !!initialDataRef.current[fieldName],
    }));
    // Clear file input
    if (fileInputRefs.current[fieldName]) {
      fileInputRefs.current[fieldName]!.value = '';
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    fields.forEach((field) => {
      if (field.required && field.type !== 'checkbox' && !formData[field.name]) {
        newErrors[field.name] = `${field.label} es requerido`;
      }
    });
    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      // Get list of updated image field names
      const updatedImageFields = Object.keys(imageUpdated).filter(
        (fieldName) => imageUpdated[fieldName] === true
      );
      
      await onSubmit(formData, updatedImageFields);
      setErrors({});
    } catch (error) {
      console.error('Error submitting form:', error);
      setErrors({ general: 'Error al guardar los datos' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors.general && (
        <div className="text-red-500 text-sm">{errors.general}</div>
      )}
      {fields.map((field) => (
        <div key={field.name} className="flex flex-col">
          <label
            htmlFor={field.name}
            className="text-sm font-medium text-gray-700 mb-1"
          >
            {field.label}
            {field.required && field.type !== 'checkbox' && (
              <span className="text-red-500"> *</span>
            )}
          </label>
          {field.type === 'textarea' ? (
            <textarea
              id={field.name}
              name={field.name}
              value={formData[field.name] || ''}
              onChange={(e) => handleChange(e, field.name)}
              placeholder={field.placeholder}
              className="border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              rows={4}
            />
          ) : field.type === 'checkbox' ? (
            <input
              id={field.name}
              name={field.name}
              type="checkbox"
              checked={!!formData[field.name]}
              onChange={(e) => handleChange(e, field.name)}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
          ) : field.type === 'image' ? (
            <div className="space-y-2">
              <input
                ref={(el) => {
                  fileInputRefs.current[field.name] = el;
                }}
                id={field.name}
                name={field.name}
                type="file"
                accept={field.accept || 'image/*'}
                onChange={(e) => handleImageChange(e, field.name, field.maxSize)}
                className="border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
              />
              {imagePreviews[field.name] && (
                <div className="relative inline-block">
                  {/* Usar object para SVG y otros formatos que puedan tener problemas */}
                  {imagePreviews[field.name].includes('.svg') || 
                   imagePreviews[field.name].includes('svg_xml') ? (
                    <object
                      data={imagePreviews[field.name]}
                      type="image/svg+xml"
                      className="max-w-xs max-h-48 rounded-md border border-gray-300"
                      style={{ width: '100%', maxWidth: '300px' }}
                    >
                      <img
                        src={imagePreviews[field.name]}
                        alt="Preview"
                        className="max-w-xs max-h-48 rounded-md border border-gray-300 object-contain bg-white"
                      />
                    </object>
                  ) : (
                    <img
                      src={imagePreviews[field.name]}
                      alt="Preview"
                      className="max-w-xs max-h-48 rounded-md border border-gray-300 object-contain bg-white"
                      crossOrigin="anonymous"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(field.name)}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 z-10"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          ) : (
            <input
              id={field.name}
              name={field.name}
              type={field.type}
              value={formData[field.name] || ''}
              onChange={(e) => handleChange(e, field.name)}
              placeholder={field.placeholder}
              className="border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          {errors[field.name] && (
            <span className="text-red-500 text-sm mt-1">{errors[field.name]}</span>
          )}
        </div>
      ))}
      <div className="flex justify-end space-x-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Guardando...' : submitButtonText}
        </button>
      </div>
    </form>
  );
}