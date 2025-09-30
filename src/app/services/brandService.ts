/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "../../firebaseConfig";
import {
    collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
    query, orderBy, startAfter, limit as fqLimit, where, Timestamp,
     type QueryDocumentSnapshot,
     DocumentSnapshot,
     getCountFromServer
} from "firebase/firestore";

import {
    getDownloadURL,
    getStorage,
    ref,
    uploadBytes,
   
  } from "firebase/storage";

// Tipos
export type PhotoBoothPrompt = {
    id: string;
    brand?: string;
    logo?: string;
    logoPath?: string;
    logoPrompt?: string;
    basePrompt: string;
    colorDirectiveTemplate: string;
    active: boolean;
    createdAt: Timestamp | Date | null;
    updatedAt: Timestamp | Date | null;
};

export type PaginationResult<T> = {
    data: T[];
    hasNext: boolean;
    lastDoc: QueryDocumentSnapshot | null;
    total?: number;
};

// Nombre de la colección
const PHOTO_BOOTH_PROMPTS_COLLECTION = "photo_booth_prompts";

/* ================== Helpers ================== */
function tsToDate(ts: any): Date | null {
    if (!ts) return null;
    if (ts instanceof Date) return ts;
    if ((ts as any)?.toDate) return (ts as any).toDate();
    if (ts instanceof Timestamp) return ts.toDate();
    return null;
}

function mapDocToPrompt(d: DocumentSnapshot): PhotoBoothPrompt {
    const data = d.data() as any;
    return {
        id: d.id,
        brand: data.brand ?? "",
        basePrompt: data.basePrompt ?? "",
        logoPath: data.logoPath ?? "",
        colorDirectiveTemplate: data.colorDirectiveTemplate ?? "",
        active: data.active ?? false,
        createdAt: tsToDate(data.createdAt),
        updatedAt: tsToDate(data.updatedAt),
    };
}

function dataURLtoBlob(dataurl: string): Blob {
    const arr = dataurl.split(',');
    // Extraer el tipo de contenido (MIME type)
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) throw new Error("Invalid Data URL format");
    const mime = mimeMatch[1];
    
    // Decodificar la base64
    const bstr = atob(arr[1]);
    let n = bstr.length;
    
    // Crear un Uint8Array
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    
    // Devolver el Blob
    return new Blob([u8arr], {type: mime});
}

/* ================== Servicio CRUD ================== */

export async function createPhotoBoothPrompt(
    data: Omit<PhotoBoothPrompt, "id" | "createdAt" | "updatedAt" | "logoPath">,
  ): Promise<string> {
    try {
      const storage = getStorage();
      let logoUrl = "";
      let fileData = data.logo; 
  
      if (fileData) {
        // 1. Normalizar la Data URL
        if (typeof fileData === "string" && !fileData.startsWith("data:")) {
          fileData = `data:${fileData}`;
        }
  
        // 2. Convertir la Data URL a un Blob
        const logoBlob = dataURLtoBlob(fileData as string);
        const contentType = logoBlob.type;
  
        // 3. Crear referencia en Storage
        const extension = contentType.split("/")[1] || "png"; // ej: "svg+xml" o "png"
        const fileName = `${Date.now()}_${data.brand}.${extension.replace("+", "_")}`;
        const logoRef = ref(storage, `logos/${fileName}`);
  
        // 4. Subir archivo
        await uploadBytes(logoRef, logoBlob, { contentType });
  
        // 5. Obtener URL de descarga
        logoUrl = await getDownloadURL(logoRef);
      }
  
      // 6. Crear documento en Firestore con logoUrl
      const promptData: Omit<PhotoBoothPrompt, "id"> = {
        brand: data.brand,
        basePrompt: data.basePrompt,
        colorDirectiveTemplate: data.colorDirectiveTemplate,
        active: data.active,
        logoPath: logoUrl, // <-- ahora guarda la URL
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
  
      const docRef = await addDoc(collection(db, PHOTO_BOOTH_PROMPTS_COLLECTION), promptData);
      return docRef.id;
  
    } catch (error) {
      console.error("Error creating prompt:", error);
      throw new Error("Error al crear el prompt");
    }
  }
// READ - Obtener todos los prompts con paginación
export async function getPhotoBoothPrompts(
    pageSize = 10,
    lastDocument: QueryDocumentSnapshot | null
): Promise<PaginationResult<PhotoBoothPrompt> & { total: number }> {
    try {
        const size = Math.max(1, Math.min(pageSize, 50));

        // 📌 Query base (aquí podrías añadir where() para filtros)
        const baseQ = query(
            collection(db, PHOTO_BOOTH_PROMPTS_COLLECTION),
            orderBy("createdAt", "desc")
        );

        let q = baseQ;

        // Si hay cursor, aplicar startAfter
        if (lastDocument) {
            q = query(baseQ, startAfter(lastDocument), fqLimit(size + 1));
        } else {
            q = query(baseQ, fqLimit(size + 1));
        }

        // 📌 Obtener los docs de la página
        const snapshot = await getDocs(q);
        const docs = snapshot.docs;

        // 📌 Obtener el total usando el mismo query base (con filtros, pero sin paginación)
        const countSnap = await getCountFromServer(baseQ);
        const total = countSnap.data().count;

        // Determinar si hay siguiente página
        const hasNext = docs.length > size;

        // Si hay más de los que pedimos, quitamos el extra
        if (hasNext) {
            docs.pop();
        }

        const data = docs.map(mapDocToPrompt);

        return {
            data,
            hasNext,
            lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
            total
        };
    } catch (error) {
        console.error("Error getting prompts:", error);
        throw new Error("Error al obtener los prompts");
    }
}


// READ - Obtener prompts activos con paginación
export async function getActivePhotoBoothPrompts(
    limit = 10, 
    lastDocument?: QueryDocumentSnapshot
): Promise<PaginationResult<PhotoBoothPrompt>> {
    try {
        let q = query(
            collection(db, PHOTO_BOOTH_PROMPTS_COLLECTION),
            where('active', '==', true),
            orderBy('createdAt', 'desc'),
            fqLimit(limit + 1)
        );

        if (lastDocument) {
            q = query(
                collection(db, PHOTO_BOOTH_PROMPTS_COLLECTION),
                where('active', '==', true),
                orderBy('createdAt', 'desc'),
                startAfter(lastDocument),
                fqLimit(limit + 1)
            );
        }

        const snapshot = await getDocs(q);
        const docs = snapshot.docs;
        
        const hasNext = docs.length > limit;
        if (hasNext) {
            docs.pop();
        }

        const data = docs.map(mapDocToPrompt);

        return {
            data,
            hasNext,
            lastDoc: docs.length > 0 ? docs[docs.length - 1] : null
        };
    } catch (error) {
        console.error('Error getting active prompts:', error);
        throw new Error('Error al obtener los prompts activos');
    }
}

// READ - Obtener un prompt por ID
export async function getPhotoBoothPromptById(id: string): Promise<PhotoBoothPrompt | null> {
    try {
        const docRef = doc(db, PHOTO_BOOTH_PROMPTS_COLLECTION, id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            return mapDocToPrompt(docSnap);
        }
        
        return null;
    } catch (error) {
        console.error('Error getting prompt by ID:', error);
        throw new Error('Error al obtener el prompt');
    }
}

// UPDATE - Actualizar un prompt
export async function updatePhotoBoothPrompt(
    id: string, 
    data: Partial<Omit<PhotoBoothPrompt,  | 'createdAt' | 'updatedAt'>>
): Promise<void> {
    console.log(data)
    try {
        const storage = getStorage();
        const docRef = doc(db, PHOTO_BOOTH_PROMPTS_COLLECTION, id);
        let logoUrl = "";
      let fileData = data.logo; 
  
      if (fileData) {
        // 1. Normalizar la Data URL
        if (typeof fileData === "string" && !fileData.startsWith("data:")) {
          fileData = `data:${fileData}`;
        }
        console.log(fileData)
        // 2. Convertir la Data URL a un Blob
        const logoBlob = dataURLtoBlob(fileData as string);
        const contentType = logoBlob.type;
  
        // 3. Crear referencia en Storage
        const extension = contentType.split("/")[1] || "png"; // ej: "svg+xml" o "png"
        const fileName = `${Date.now()}_${data.brand}.${extension.replace("+", "_")}`;
        const logoRef = ref(storage, `logos/${fileName}`);
  
        // 4. Subir archivo
        await uploadBytes(logoRef, logoBlob, { contentType });
  
        // 5. Obtener URL de descarga
        logoUrl = await getDownloadURL(logoRef);
      }
        const updateData = {
            brand: data.brand,
        basePrompt: data.basePrompt,
        colorDirectiveTemplate: data.colorDirectiveTemplate,
        active: data.active,
        logoPath: logoUrl, // <-- ahora guarda la URL
            updatedAt: Timestamp.now()
        };
        
        await updateDoc(docRef, updateData);
    } catch (error) {
        console.error('Error updating prompt:', error);
        throw new Error('Error al actualizar el prompt');
    }
}

// DELETE - Eliminar un prompt
export async function deletePhotoBoothPrompt(id: string): Promise<void> {
    try {
        const docRef = doc(db, PHOTO_BOOTH_PROMPTS_COLLECTION, id);
        await deleteDoc(docRef);
    } catch (error) {
        console.error('Error deleting prompt:', error);
        throw new Error('Error al eliminar el prompt');
    }
}

// BULK DELETE - Eliminar múltiples prompts
export async function bulkDeletePhotoBoothPrompts(ids: string[]): Promise<void> {
    try {
        const deletePromises = ids.map(id => {
            const docRef = doc(db, PHOTO_BOOTH_PROMPTS_COLLECTION, id);
            return deleteDoc(docRef);
        });
        
        await Promise.all(deletePromises);
    } catch (error) {
        console.error('Error bulk deleting prompts:', error);
        throw new Error('Error al eliminar los prompts');
    }
}

// TOGGLE ACTIVE - Cambiar estado activo/inactivo
export async function togglePhotoBoothPromptActive(id: string): Promise<void> {
    try {
        const prompt = await getPhotoBoothPromptById(id);
        if (!prompt) {
            throw new Error('Prompt no encontrado');
        }
        
        await updatePhotoBoothPrompt(id, { active: !prompt.active });
    } catch (error) {
        console.error('Error toggling prompt active status:', error);
        throw new Error('Error al cambiar el estado del prompt');
    }
}

// SEARCH - Buscar prompts por texto (implementación básica)
export async function searchPhotoBoothPrompts(
    searchTerm: string, 
    limit = 10
): Promise<PhotoBoothPrompt[]> {
    try {
        // Nota: Firestore no tiene búsqueda de texto completo nativa
        // Esta es una implementación básica
        const snapshot = await getDocs(
            query(
                collection(db, PHOTO_BOOTH_PROMPTS_COLLECTION),
                orderBy('basePrompt'),
                fqLimit(limit * 5) // Obtenemos más para filtrar localmente
            )
        );

        const allPrompts = snapshot.docs.map(mapDocToPrompt);

        // Filtrar localmente
        const filteredPrompts = allPrompts.filter(prompt =>
            prompt.basePrompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
            prompt.colorDirectiveTemplate.toLowerCase().includes(searchTerm.toLowerCase())
        );

        return filteredPrompts.slice(0, limit);
    } catch (error) {
        console.error('Error searching prompts:', error);
        throw new Error('Error al buscar prompts');
    }
}

// COUNT - Contar total de prompts
export async function countPhotoBoothPrompts(): Promise<number> {
    try {
        const snapshot = await getDocs(collection(db, PHOTO_BOOTH_PROMPTS_COLLECTION));
        return snapshot.size;
    } catch (error) {
        console.error('Error counting prompts:', error);
        throw new Error('Error al contar prompts');
    }
}

// COUNT ACTIVE - Contar prompts activos
export async function countActivePhotoBoothPrompts(): Promise<number> {
    try {
        const q = query(
            collection(db, PHOTO_BOOTH_PROMPTS_COLLECTION), 
            where('active', '==', true)
        );
        const snapshot = await getDocs(q);
        return snapshot.size;
    } catch (error) {
        console.error('Error counting active prompts:', error);
        throw new Error('Error al contar prompts activos');
    }
}

/* ================== Utilidades ================== */
export const photoBoothPromptsUtils = {
    // Validar datos de prompt
    validatePrompt: (data: Partial<PhotoBoothPrompt>): string[] => {
        const errors: string[] = [];
        
        if (!data.basePrompt || data.basePrompt.trim().length === 0) {
            errors.push('El prompt base es requerido');
        }
        
        if (!data.colorDirectiveTemplate || data.colorDirectiveTemplate.trim().length === 0) {
            errors.push('La plantilla de directiva de color es requerida');
        }
        
        if (typeof data.active !== 'boolean') {
            errors.push('El estado activo debe ser verdadero o falso');
        }
        
        return errors;
    },

    // Formatear prompt para mostrar
    formatPromptForDisplay: (prompt: PhotoBoothPrompt): string => {
        return `${prompt.basePrompt} | ${prompt.colorDirectiveTemplate}`;
    },

    // Formatear fecha
    formatDate: (date: Date | null): string => {
        if (!date) return '-';
        return new Intl.DateTimeFormat('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }
};