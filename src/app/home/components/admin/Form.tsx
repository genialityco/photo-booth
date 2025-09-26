/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from 'react';

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'email' | 'checkbox' | string; // Added checkbox type
  required?: boolean;
  placeholder?: string;
}

interface FormProps<T> {
  initialData: any;
  fields: FormField[];
  onSubmit: (data: any) => Promise<void>;
  submitButtonText?: string;
}

export default function Form<T extends Record<string, string >>({
  initialData,
  fields,
  onSubmit,
  submitButtonText = 'Guardar',
}: FormProps<T>) {
  const [formData, setFormData] = useState<T>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update formData when initialData changes
  useEffect(() => {
    setFormData(initialData);
  }, [initialData]);

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

  const validate = () => {
    const newErrors: Record<string, string> = {};
    fields.forEach((field) => {
      if (field.required && field.type !== 'checkbox' && !formData[field.name]) {
        newErrors[field.name] = `${field.label} es requerido`;
      }
      // Optional: Add specific validation for checkbox if needed
      // e.g., if (field.required && field.type === 'checkbox' && !formData[field.name]) { ... }
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
      await onSubmit(formData);
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