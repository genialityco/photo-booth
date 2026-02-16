/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/firebaseConfig";
import {
  collection,
  addDoc,
  Timestamp,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  where,
} from "firebase/firestore";

export type EventProfile = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  bgImage?: string;
  logoTop?: string;
  logoBottom?: string;
  frameImage?: string;
  buttonImage?: string;
  loadingPageImage?: string;
  loadingMessage?: string;
  showLogosInLoader?: boolean; // Controla si mostrar logos en LoaderStep
  enableFrame?: boolean; // Controla si mostrar el marco en ResultStep
  prompts: string[];
  isActive: boolean;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
};

const COLLECTION = "events";

function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(",");
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

/**
 * Upload image using Next.js API route (avoids CORS issues)
 */
async function uploadImageViaAPI(
  imageData: string,
  fileName: string,
  eventSlug: string
): Promise<string> {
  try {
    // Use the Next.js API route instead of Cloud Function directly
    const response = await fetch("/api/storage/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dataUrl: imageData,
        desiredPath: `events/${eventSlug}/${fileName}`,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Upload failed" }));
      throw new Error(error.error || "Failed to upload image");
    }

    const result = await response.json();
    return result.url;
  } catch (error) {
    console.error("Error uploading image via API:", error);
    throw error;
  }
}

/**
 * Create a new event profile
 */
export async function createEventProfile(
  data: Partial<EventProfile & Record<string, any>>
): Promise<string> {
  try {
    const docData: Record<string, any> = {
      slug: data.slug || "",
      name: data.name || "",
      description: data.description || "",
      prompts: Array.isArray(data.prompts) ? data.prompts : [],
      isActive: data.isActive !== false,
      showLogosInLoader: data.showLogosInLoader !== false,
      enableFrame: data.enableFrame !== false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Image fields to process
    const imageFields = ["bgImage", "logoTop", "logoBottom", "frameImage", "buttonImage", "loadingPageImage"];

    for (const field of imageFields) {
      const fileData = data[field];
      if (!fileData) continue;

      let normalized = fileData as string;
      if (
        typeof normalized === "string" &&
        !normalized.startsWith("data:") &&
        !normalized.startsWith("http")
      ) {
        normalized = `data:${normalized}`;
      }

      // If it's already a URL, skip upload
      if (normalized.startsWith("http")) {
        docData[field] = normalized;
        continue;
      }

      // Upload via Next.js API
      const blob = dataURLtoBlob(normalized);
      const contentType = blob.type || "image/png";
      const extension = contentType.split("/")[1] || "png";
      const fileName = `${field}.${extension.replace("+", "_")}`;
      
      const url = await uploadImageViaAPI(
        normalized,
        fileName,
        data.slug || "event"
      );
      docData[field] = url;
    }

    // Add optional text fields
    if (data.loadingMessage !== undefined) {
      docData.loadingMessage = data.loadingMessage;
    }

    const docRef = await addDoc(collection(db, COLLECTION), docData);
    return docRef.id;
  } catch (error) {
    console.error("Error creating event profile:", error);
    throw error;
  }
}

/**
 * Get all event profiles
 */
export async function getEventProfiles(): Promise<EventProfile[]> {
  try {
    const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as EventProfile[];
  } catch (error) {
    console.error("Error getting event profiles:", error);
    throw error;
  }
}

/**
 * Get active event profiles
 */
export async function getActiveEventProfiles(): Promise<EventProfile[]> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where("isActive", "==", true),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as EventProfile[];
  } catch (error) {
    console.error("Error getting active event profiles:", error);
    throw error;
  }
}

/**
 * Get event profile by ID
 */
export async function getEventProfileById(
  id: string
): Promise<EventProfile | null> {
  try {
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as EventProfile;
  } catch (error) {
    console.error("Error getting event profile by ID:", error);
    throw error;
  }
}

/**
 * Get event profile by slug
 */
export async function getEventProfileBySlug(
  slug: string
): Promise<EventProfile | null> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where("slug", "==", slug),
      where("isActive", "==", true)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
    } as EventProfile;
  } catch (error) {
    console.error("Error getting event profile by slug:", error);
    throw error;
  }
}

/**
 * Update event profile
 */
export async function updateEventProfile(
  id: string,
  data: Partial<EventProfile & Record<string, any>>
): Promise<void> {
  try {
    const docData: Record<string, any> = {
      updatedAt: Timestamp.now(),
    };

    // Update simple fields
    if (data.name !== undefined) docData.name = data.name;
    if (data.description !== undefined) docData.description = data.description;
    if (data.slug !== undefined) docData.slug = data.slug;
    if (data.prompts !== undefined && Array.isArray(data.prompts)) {
      docData.prompts = data.prompts;
    }
    if (data.isActive !== undefined) docData.isActive = data.isActive;
    if (data.loadingMessage !== undefined) docData.loadingMessage = data.loadingMessage;
    if (data.showLogosInLoader !== undefined) docData.showLogosInLoader = data.showLogosInLoader;
    if (data.enableFrame !== undefined) docData.enableFrame = data.enableFrame;

    // Process image fields
    const imageFields = ["bgImage", "logoTop", "logoBottom", "frameImage", "buttonImage", "loadingPageImage"];
    for (const field of imageFields) {
      const fileData = data[field];
      if (!fileData) continue;

      let normalized = fileData as string;
      if (
        typeof normalized === "string" &&
        !normalized.startsWith("data:") &&
        !normalized.startsWith("http")
      ) {
        normalized = `data:${normalized}`;
      }

      // If it's already a URL, skip upload
      if (normalized.startsWith("http")) {
        docData[field] = normalized;
        continue;
      }

      // Upload via Next.js API
      const blob = dataURLtoBlob(normalized);
      const contentType = blob.type || "image/png";
      const extension = contentType.split("/")[1] || "png";
      const fileName = `${field}.${extension.replace("+", "_")}`;

      const url = await uploadImageViaAPI(
        normalized,
        fileName,
        data.slug || "event"
      );
      docData[field] = url;
    }

    const docRef = doc(db, COLLECTION, id);
    await updateDoc(docRef, docData);
  } catch (error) {
    console.error("Error updating event profile:", error);
    throw error;
  }
}

/**
 * Delete event profile
 */
export async function deleteEventProfile(id: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting event profile:", error);
    throw error;
  }
}

/**
 * Generate share URL for an event
 */
export function generateEventUrl(
  baseUrl: string,
  slug: string
): string {
  return `${baseUrl}/booth/${slug}`;
}
