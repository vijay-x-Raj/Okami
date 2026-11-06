import {
  ensureMediaType,
  getFullDetail,
  pickImage,
  type FranchiseAdaptationNode,
  type FranchiseExtraNode,
  type FranchiseGraph,
  type FranchiseSeasonNode,
  type JikanItem,
  type MediaType,
} from "@/app/lib/jikan";

const RELEVANT_RELATIONS = new Set([
  "sequel",
  "prequel",
  "parent story",
  "side story",
  "adaptation",
  "spin-off",
  "alternative version",
  "full story",
]);

const MAX_NODES_TO_FETCH = 10;
const MAX_DEPTH = 3;

function resolveYearFromItem(item: JikanItem, type: MediaType): number {
  if (typeof item.year === "number") return item.year;
  if (type === "anime") {
    const y = item.aired?.prop?.from?.year;
    return typeof y === "number" ? y : 0;
  }
  const py = item.published?.prop?.from?.year;
  return typeof py === "number" ? py : 0;
}

function resolveItemTitle(item: JikanItem): string {
  return item.title_english || item.title || item.title_japanese || "Untitled";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = ensureMediaType(url.searchParams.get("type"));
  const id = Number(url.searchParams.get("id"));

  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const visited = new Set<string>();
    const fetchedItems = new Map<string, { item: JikanItem; mediaType: MediaType }>();

    // BFS Queue: { id, type, depth }
    const queue: Array<{ id: number; type: MediaType; depth: number }> = [
      { id, type, depth: 0 },
    ];
    visited.add(`${type}:${id}`);

    while (queue.length > 0 && fetchedItems.size < MAX_NODES_TO_FETCH) {
      const current = queue.shift()!;
      try {
        const item = await getFullDetail(current.type, current.id);
        const itemKey = `${current.type}:${current.id}`;
        fetchedItems.set(itemKey, { item, mediaType: current.type });

        if (current.depth < MAX_DEPTH) {
          const relations = item.relations || [];
          for (const rel of relations) {
            const relName = (rel.relation || "").trim().toLowerCase();
            if (!RELEVANT_RELATIONS.has(relName)) continue;

            const entries = rel.entry || [];
            for (const ent of entries) {
              const entType: MediaType = ent.type?.toLowerCase() === "manga" ? "manga" : "anime";
              const entKey = `${entType}:${ent.mal_id}`;
              if (!visited.has(entKey) && queue.length + fetchedItems.size < MAX_NODES_TO_FETCH * 2) {
                visited.add(entKey);
                queue.push({ id: ent.mal_id, type: entType, depth: current.depth + 1 });
              }
            }
          }
        }
      } catch {
        // Continue if single item fails to fetch
      }
    }

    // Now organize nodes into seasons, extras, adaptations
    const rawSeasons: FranchiseSeasonNode[] = [];
    const extras: FranchiseExtraNode[] = [];
    const adaptations: FranchiseAdaptationNode[] = [];

    for (const [, { item, mediaType }] of fetchedItems) {
      const title = resolveItemTitle(item);
      const cover = pickImage(item.images);
      const year = resolveYearFromItem(item, mediaType);
      const rawType = (item.type || (mediaType === "anime" ? "TV" : "Manga")).toUpperCase();

      if (mediaType === "manga") {
        adaptations.push({
          malId: item.mal_id,
          title,
          type: item.type || "Manga",
          chapters: item.chapters ?? null,
          volumes: item.volumes ?? null,
          publishedFrom: item.published?.from ?? null,
          year,
          score: item.score ?? null,
          cover,
        });
      } else {
        // Anime
        const isMainline = rawType === "TV" || rawType === "ONA";
        if (isMainline) {
          rawSeasons.push({
            malId: item.mal_id,
            title,
            type: rawType,
            seasonNumber: 1, // Will renumber after sorting
            episodes: item.episodes ?? null,
            airedFrom: item.aired?.from ?? null,
            year,
            score: item.score ?? null,
            cover,
          });
        } else {
          extras.push({
            malId: item.mal_id,
            title,
            type: item.type || "Special",
            episodes: item.episodes ?? null,
            airedFrom: item.aired?.from ?? null,
            year,
            score: item.score ?? null,
            cover,
          });
        }
      }
    }

    // Sort seasons chronologically
    rawSeasons.sort((a, b) => {
      if (a.airedFrom && b.airedFrom) {
        return new Date(a.airedFrom).getTime() - new Date(b.airedFrom).getTime();
      }
      if (a.year !== b.year) {
        return a.year - b.year;
      }
      return a.malId - b.malId;
    });

    // Renumber seasons
    const seasons = rawSeasons.map((season, index) => ({
      ...season,
      seasonNumber: index + 1,
    }));

    // Sort extras chronologically
    extras.sort((a, b) => {
      if (a.airedFrom && b.airedFrom) {
        return new Date(a.airedFrom).getTime() - new Date(b.airedFrom).getTime();
      }
      return a.year - b.year;
    });

    // Sort adaptations chronologically
    adaptations.sort((a, b) => {
      if (a.publishedFrom && b.publishedFrom) {
        return new Date(a.publishedFrom).getTime() - new Date(b.publishedFrom).getTime();
      }
      return a.year - b.year;
    });

    // Compute deterministic rootMalId:
    // 1. Earliest mainline TV season mal_id
    // 2. Earliest anime extra mal_id
    // 3. Earliest manga adaptation mal_id
    // 4. Initial id fallback
    let rootMalId = id;
    let rootTitle = "";
    let rootCover = "";

    if (seasons.length > 0) {
      rootMalId = seasons[0].malId;
      rootTitle = seasons[0].title;
      rootCover = seasons[0].cover;
    } else if (extras.length > 0) {
      rootMalId = extras[0].malId;
      rootTitle = extras[0].title;
      rootCover = extras[0].cover;
    } else if (adaptations.length > 0) {
      rootMalId = adaptations[0].malId;
      rootTitle = adaptations[0].title;
      rootCover = adaptations[0].cover;
    }

    // If root title/cover still empty, get from initial item if available
    const initialKey = `${type}:${id}`;
    if ((!rootTitle || !rootCover) && fetchedItems.has(initialKey)) {
      const initItem = fetchedItems.get(initialKey)!.item;
      rootTitle = rootTitle || resolveItemTitle(initItem);
      rootCover = rootCover || pickImage(initItem.images);
    }

    const franchiseId = `franchise_${rootMalId}`;

    const graph: FranchiseGraph = {
      franchiseId,
      rootMalId,
      title: rootTitle || "Unknown Franchise",
      cover: rootCover || "",
      seasons,
      extras,
      adaptations,
    };

    return Response.json({ data: graph });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to resolve franchise graph" },
      { status: 502 }
    );
  }
}

