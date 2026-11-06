import { getFullDetail, type JikanItem } from "@/app/lib/jikan";

export interface MangaVolumeItem {
  mal_id: number;
  volume_number: number;
  title: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));

  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ volumes: [] }, { status: 200 });
  }

  try {
    const item: JikanItem = await getFullDetail("manga", id);
    const volCount = item.volumes ?? (item.chapters ? Math.ceil(item.chapters / 9) : 0);
    const total = Math.max(volCount, 1);

    const volumes: MangaVolumeItem[] = Array.from({ length: total }, (_, i) => {
      const volNum = i + 1;
      return {
        mal_id: volNum,
        volume_number: volNum,
        title: `Volume ${volNum}`,
      };
    });

    return Response.json({ volumes, totalVolumes: item.volumes ?? null, totalChapters: item.chapters ?? null });
  } catch {
    return Response.json({ volumes: [] }, { status: 502 });
  }
}
