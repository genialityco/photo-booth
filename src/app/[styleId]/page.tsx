import Landing from "@/app/home/components/public/landing";

interface Props {
  params: { styleId: string };
}

export default async function StyleRoutePage({ params }: Props) {
  const { styleId } = await params;
  return <Landing styleId={styleId} />;
}
