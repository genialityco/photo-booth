/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getAdminServices } from "@/server/firebaseAdmin";

export const runtime = "nodejs";

// De "tasks/abc/input.png" -> "tasks/abc"
function folderOf(p?: string | null) {
  if (typeof p !== "string" || !p) return null;
  const m = p.match(/^(.*)\/[^/]+$/);
  return m ? m[1] : null;
}

/**
 * Elimina UNA foto: el doc de `imageTasks` y los archivos que dejó en Storage.
 *
 * Además de las rutas guardadas en el doc (input/framed/output/video), se borra
 * por prefijo la carpeta `tasks/<taskId>/` completa, porque el pipeline escribe
 * ahí archivos que el doc no siempre referencia (output_video.mp4, intermedios).
 * El borrado por prefijo se limita a rutas con forma `tasks/<algo>` para no
 * arrasar con un directorio raíz si algún doc viejo trae un path plano.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    if (!taskId) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 });
    }

    const { db, bucket } = getAdminServices();

    const docRef = db.collection("imageTasks").doc(taskId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const data = snap.data() || {};

    const filesToDelete: string[] = [
      data.inputPath,
      data.framedPath,
      data.outputPath,
      data.videoOutputPath,
    ].filter((p): p is string => typeof p === "string" && !!p);

    // Carpetas `tasks/<id>` derivadas de los paths del doc (más la canónica).
    const folders = new Set<string>([`tasks/${taskId}`]);
    for (const p of filesToDelete) {
      const f = folderOf(p);
      if (f && /^tasks\/[^/]+$/.test(f)) folders.add(f);
    }

    await docRef.delete();

    const results = await Promise.allSettled([
      ...[...folders].map((folder) =>
        bucket.deleteFiles({ prefix: `${folder}/` })
      ),
      ...filesToDelete.map(async (filePath) => {
        try {
          await bucket.file(filePath).delete();
        } catch (err: any) {
          if (err?.code !== 404) throw err;
        }
      }),
    ]);

    const storageErrors = results.filter((r) => r.status === "rejected").length;
    if (storageErrors) {
      console.warn(
        `[imageTasks/${taskId}] doc eliminado, pero ${storageErrors} borrado(s) de Storage fallaron`
      );
    }

    return NextResponse.json({ message: "Deleted", id: taskId, storageErrors });
  } catch (error: any) {
    console.error("Error deleting image task:", error);
    return NextResponse.json(
      { error: "Failed to delete image", details: error?.message },
      { status: 500 }
    );
  }
}
