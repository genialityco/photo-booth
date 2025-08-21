/* eslint-disable @next/next/no-img-element */
interface PreviewViewProps {
    photo: string;
    onDiscard: () => void;
    onProcess: () => void;
}

import ButtonPrimary from "../items/ButtonPrimary";
import ButtonDanger from "../items/ButtonDanger";

export default function PreviewView({
    photo,
    onDiscard,
    onProcess,
}: PreviewViewProps) {
    return (
        <div className="flex flex-col items-center space-y-4">
            <img src={photo} alt="Preview" className="rounded-lg shadow-lg max-h-[70vh]" />
            <div className="flex space-x-4">
                <ButtonDanger onClick={onDiscard} label="Volver a tomar foto" />
                <ButtonPrimary onClick={onProcess} label="Entrar al laboratorio" />
            </div>
        </div>
    );
}
