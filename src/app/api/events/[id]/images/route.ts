/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getAdminServices } from "@/server/firebaseAdmin";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db, bucket } = getAdminServices();
    const resolvedParams = await params;
    const eventId = resolvedParams.id;

    if (!eventId) {
      return NextResponse.json(
        { error: "Event ID is required" },
        { status: 400 }
      );
    }

    // Buscar todas las tareas asociadas al evento
    const tasksSnapshot = await db
      .collection("imageTasks")
      .where("eventId", "==", eventId)
      .get();

    if (tasksSnapshot.empty) {
      return NextResponse.json({ message: "No images found for this event" });
    }

    const batch = db.batch();
    const filesToDelete: string[] = [];

    tasksSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      // Recopilar rutas de storage a eliminar
      if (data.inputPath) filesToDelete.push(data.inputPath);
      if (data.framedPath) filesToDelete.push(data.framedPath);
      if (data.outputPath) filesToDelete.push(data.outputPath);
      if (data.videoOutputPath) filesToDelete.push(data.videoOutputPath);

      // Agregar documento al batch para eliminar
      batch.delete(doc.ref);
    });

    // Eliminar documentos de Firestore
    await batch.commit();

    // Eliminar archivos de Storage de forma paralela (ignorando errores de archivo no encontrado)
    await Promise.allSettled(
      filesToDelete.map(async (filePath) => {
        try {
          const file = bucket.file(filePath);
          await file.delete();
        } catch (err: any) {
          // Ignorar si el archivo no existe
          if (err.code !== 404) {
            console.error(`Error deleting file ${filePath}:`, err);
          }
        }
      })
    );

    return NextResponse.json({
      message: `Deleted ${tasksSnapshot.size} images successfully`,
      count: tasksSnapshot.size,
    });
  } catch (error: any) {
    console.error("Error deleting event images:", error);
    return NextResponse.json(
      { error: "Failed to delete event images", details: error.message },
      { status: 500 }
    );
  }
}
