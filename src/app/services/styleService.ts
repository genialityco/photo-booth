/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "../../firebaseConfig";
import { collection, addDoc, Timestamp, getDocs, query, orderBy, doc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

export type StyleProfile = {
  id: string;
  name: string;
  enableFrame?: boolean;
  bgLanding?: string;
  bgCapture?: string;
  bgLoading?: string;
  bgResults?: string;
  logoLandingTop?: string;
  logoLandingBottom?: string;
  logoCaptureTop?: string;
  logoCaptureBottom?: string;
  logoLoadingTop?: string;
  logoLoadingBottom?: string;
  logoResultsTop?: string;
  logoResultsBottom?: string;
  frameImage?: string;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
};

const COLLECTION = "style_profiles";

function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch) throw new Error("Invalid Data URL format");
  const mime = mimeMatch[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

export async function createStyleProfile(data: Partial<StyleProfile & Record<string, any>>): Promise<string> {
  try {
    const storage = getStorage();
    const docData: Record<string, any> = {
      name: data.name || "",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Lista de campos de imagen que esperamos
    const imageFields = [
      "bgLanding",
      "bgCapture",
      "bgLoading",
      "bgResults",
      "logoLandingTop",
      "logoLandingBottom",
      "logoCaptureTop",
      "logoCaptureBottom",
      "logoLoadingTop",
      "logoLoadingBottom",
      "logoResultsTop",
      "logoResultsBottom",
      "frameImage",
    ];

    for (const field of imageFields) {
      const fileData = data[field];
      if (!fileData) continue;

      let normalized = fileData as string;
      if (typeof normalized === "string" && !normalized.startsWith("data:")) {
        normalized = `data:${normalized}`;
      }

      const blob = dataURLtoBlob(normalized);
      const contentType = blob.type || "image/png";
      const extension = contentType.split("/")[1] || "png";
      const safeName = (data.name || "style").replace(/[^a-z0-9\-]/gi, "_");
      const fileName = `${Date.now()}_${safeName}_${field}.${extension.replace("+", "_")}`;
      const storageRef = ref(storage, `styles/${fileName}`);
      await uploadBytes(storageRef, blob, { contentType });
      const url = await getDownloadURL(storageRef);
      docData[field] = url;
    }

    // optional brands association
    if (data.brands && Array.isArray(data.brands)) {
      docData.brands = data.brands;
    }

    // enableFrame flag
    if (data.enableFrame !== undefined) {
      docData.enableFrame = !!data.enableFrame;
    }

    const docRef = await addDoc(collection(db, COLLECTION), docData);
    return docRef.id;
  } catch (error) {
    console.error("Error creating style profile:", error);
    throw new Error("Error al crear el perfil de estilo");
  }
}

export async function getStyleProfiles(): Promise<StyleProfile[]> {
  try {
    const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  } catch (error) {
    console.error('Error getting style profiles:', error);
    return [];
  }

}

export async function getStyleProfileById(id: string): Promise<StyleProfile | null> {
  try {
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return { id: docSnap.id, ...(docSnap.data() as any) } as StyleProfile;
  } catch (error) {
    console.error('Error getting style profile by id:', error);
    return null;
  }
}

export async function updateStyleProfile(id: string, data: Partial<StyleProfile & Record<string, any>>): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Perfil no encontrado');

    const storage = getStorage();
    const updateData: Record<string, any> = { name: data.name, updatedAt: Timestamp.now() };

    const imageFields = [
      "bgLanding",
      "bgCapture",
      "bgLoading",
      "bgResults",
      "logoLandingTop",
      "logoLandingBottom",
      "logoCaptureTop",
      "logoCaptureBottom",
      "logoLoadingTop",
      "logoLoadingBottom",
      "logoResultsTop",
      "logoResultsBottom",
      "frameImage",
    ];

    for (const field of imageFields) {
      if (data[field] === undefined) continue;
      const fileData = data[field];
      if (fileData === null) {
        updateData[field] = null;
        continue;
      }
      if (typeof fileData === 'string' && fileData.startsWith('data:')) {
        const blob = dataURLtoBlob(fileData);
        const contentType = blob.type || 'image/png';
        const extension = contentType.split('/')[1] || 'png';
        const safeName = (data.name || 'style').replace(/[^a-z0-9\-]/gi, '_');
        const fileName = `${Date.now()}_${safeName}_${field}.${extension.replace('+', '_')}`;
        const storageRef = ref(storage, `styles/${fileName}`);
        await uploadBytes(storageRef, blob, { contentType });
        const url = await getDownloadURL(storageRef);
        updateData[field] = url;
      } else if (typeof fileData === 'string') {
        // assume it's already a URL, keep it
        updateData[field] = fileData;
      }
    }

    if (data.brands !== undefined) {
      updateData.brands = Array.isArray(data.brands) ? data.brands : [];
    }

    if (data.enableFrame !== undefined) {
      updateData.enableFrame = !!data.enableFrame;
    }

    await updateDoc(docRef, updateData);
  } catch (error) {
    console.error('Error updating style profile:', error);
    throw new Error('Error al actualizar el perfil de estilo');
  }
}

export async function deleteStyleProfile(id: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting style profile:', error);
    throw new Error('Error al eliminar el perfil de estilo');
  }
}
