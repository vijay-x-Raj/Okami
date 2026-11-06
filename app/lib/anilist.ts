import type {
  FranchiseAdaptationNode,
  FranchiseExtraNode,
  FranchiseGraph,
  FranchiseSeasonNode,
  JikanCharacter,
  MediaType,
  OkamiMedia,
} from "./jikan";

const ANILIST_GRAPHQL_ENDPOINT = "https://graphql.anilist.co";

interface AniListTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
}

interface AniListCoverImage {
  extraLarge?: string | null;
  large?: string | null;
  medium?: string | null;
}

interface AniListMediaNode {
  id: number;
  idMal?: number | null;
  type?: "ANIME" | "MANGA" | null;
  title?: AniListTitle | null;
  coverImage?: AniListCoverImage | null;
  bannerImage?: string | null;
  format?: string | null;
  status?: string | null;
  description?: string | null;
  seasonYear?: number | null;
  startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  duration?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  rankings?: Array<{ rank?: number; type?: string; allTime?: boolean }> | null;
  genres?: string[] | null;
  synopsis?: string | null;
  trailer?: { id?: string | null; site?: string | null } | null;
  studios?: { nodes?: Array<{ name: string; isAnimationStudio?: boolean }> } | null;
  staff?: { edges?: Array<{ role?: string; node?: { name?: { full?: string } } }> } | null;
  relations?: {
    edges?: Array<{
      relationType?: string;
      node?: AniListMediaNode;
    }>;
  } | null;
  characters?: {
    edges?: Array<{
      role?: string;
      node?: {
        id: number;
        name?: { full?: string };
        image?: { large?: string; medium?: string };
      };
      voiceActors?: Array<{
        id: number;
        name?: { full?: string };
        languageV2?: string;
        image?: { large?: string; medium?: string };
      }>;
    }>;
  } | null;
}

const FORMAT_MAP: Record<string, string> = {
  TV: "TV Series",
  TV_SHORT: "TV Short",
  MOVIE: "Film",
  SPECIAL: "Special",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "Music",
  MANGA: "Manga",
  NOVEL: "Light Novel",
  ONE_SHOT: "One Shot",
};

const STATUS_MAP: Record<string, string> = {
  FINISHED: "Finished Airing",
  RELEASING: "Currently Airing",
  NOT_YET_RELEASED: "Not yet aired",
  CANCELLED: "Cancelled",
  HIATUS: "On Hiatus",
};

function cleanSynopsis(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

const STANDARD_GENRES: Record<string, string> = {
  action: "Action",
  adventure: "Adventure",
  comedy: "Comedy",
  drama: "Drama",
  ecchi: "Ecchi",
  fantasy: "Fantasy",
  horror: "Horror",
  "mahou shoujo": "Mahou Shoujo",
  mecha: "Mecha",
  music: "Music",
  mystery: "Mystery",
  psychological: "Psychological",
  romance: "Romance",
  "sci-fi": "Sci-Fi",
  scifi: "Sci-Fi",
  "slice of life": "Slice of Life",
  sports: "Sports",
  supernatural: "Supernatural",
  thriller: "Thriller",
};

function normalizeGenreName(g: string): string {
  const lower = g.trim().toLowerCase();
  return STANDARD_GENRES[lower] || (lower.charAt(0).toUpperCase() + lower.slice(1));
}

export function normalizeAniListItem(node: AniListMediaNode, fallbackType?: MediaType): OkamiMedia {
  const type: MediaType =
    node.type === "MANGA" || fallbackType === "manga" ? "manga" : "anime";

  // Use idMal if available, otherwise fallback to AniList ID (both are positive integers)
  const id = typeof node.idMal === "number" && node.idMal > 0 ? node.idMal : node.id;
  const title =
    node.title?.english ||
    node.title?.romaji ||
    node.title?.native ||
    "Untitled";

  const cover =
    node.coverImage?.extraLarge ||
    node.coverImage?.large ||
    node.coverImage?.medium ||
    "";

  const banner = node.bannerImage || null;
  const year =
    node.seasonYear ||
    node.startDate?.year ||
    0;

  const rawFormat = node.format || (type === "anime" ? "TV" : "MANGA");
  const format = FORMAT_MAP[rawFormat] || rawFormat;

  const genres = Array.isArray(node.genres) ? node.genres.filter(Boolean) : [];
  const officialScore =
    typeof node.averageScore === "number" && node.averageScore > 0
      ? Number((node.averageScore / 10).toFixed(1))
      : 0;

  const status = node.status ? STATUS_MAP[node.status] || node.status : undefined;
  const total =
    type === "anime"
      ? node.episodes ?? null
      : node.chapters ?? node.volumes ?? null;

  const studios: string[] = [];
  if (node.studios?.nodes && Array.isArray(node.studios.nodes)) {
    node.studios.nodes.forEach((s) => {
      if (s?.name) studios.push(s.name);
    });
  }

  const authors: string[] = [];
  if (node.staff?.edges && Array.isArray(node.staff.edges)) {
    node.staff.edges.forEach((edge) => {
      const role = edge.role?.toLowerCase() || "";
      if (
        (role.includes("story") || role.includes("art") || role.includes("original") || role.includes("author")) &&
        edge.node?.name?.full
      ) {
        authors.push(edge.node.name.full);
      }
    });
  }

  const trailerUrl =
    node.trailer?.site === "youtube" && node.trailer?.id
      ? `https://www.youtube.com/watch?v=${node.trailer.id}`
      : null;

  return {
    id,
    type,
    title,
    title_english: node.title?.english || null,
    title_japanese: node.title?.native || null,
    cover,
    banner,
    year,
    format,
    genres,
    official_score: officialScore,
    rank: null,
    popularity: node.popularity ?? null,
    status,
    total,
    episodes: node.episodes ?? null,
    chapters: node.chapters ?? null,
    volumes: node.volumes ?? null,
    synopsis: cleanSynopsis(node.description),
    studios,
    authors,
    trailer_url: trailerUrl,
    streaming: [],
    external: [],
  };
}

async function executeAniListQuery<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second safety timeout

  try {
    const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`AniList returned HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (payload.errors && payload.errors.length > 0) {
      throw new Error(payload.errors[0]?.message || "AniList query error");
    }

    if (!payload.data) {
      throw new Error("No data returned from AniList");
    }

    return payload.data;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Search Functionality ───

export interface AniListSearchParams {
  type?: MediaType;
  query?: string;
  genres?: string[];
  season?: string;
  seasonYear?: number;
  studio?: string;
  sort?: "trending" | "score" | "popular" | "newest" | "title";
  format?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export async function aniListSearch(
  params: AniListSearchParams
): Promise<{ data: OkamiMedia[]; pagination: { last_visible_page: number; has_next_page: boolean; total?: number } }> {
  const mediaType = params.type === "manga" ? "MANGA" : "ANIME";
  const page = Math.max(1, params.page || 1);
  const perPage = Math.min(50, Math.max(1, params.limit || 24));

  const variables: Record<string, unknown> = {
    page,
    perPage,
    type: mediaType,
  };

  const conditions: string[] = ["type: $type"];

  if (params.query && params.query.trim().length > 0) {
    variables.search = params.query.trim();
    conditions.push("search: $search");
  }

  if (params.genres && params.genres.length > 0) {
    variables.genre_in = params.genres.map(normalizeGenreName);
    conditions.push("genre_in: $genre_in");
  }

  if (params.season) {
    const upperSeason = params.season.toUpperCase();
    if (["WINTER", "SPRING", "SUMMER", "FALL"].includes(upperSeason)) {
      variables.season = upperSeason;
      conditions.push("season: $season");
    }
  }

  if (params.seasonYear && params.seasonYear > 1950) {
    variables.seasonYear = params.seasonYear;
    conditions.push("seasonYear: $seasonYear");
  }

  if (params.status) {
    const statusMap: Record<string, string> = {
      airing: "RELEASING",
      publishing: "RELEASING",
      finished: "FINISHED",
      upcoming: "NOT_YET_RELEASED",
    };
    const s = statusMap[params.status.toLowerCase()] || params.status.toUpperCase();
    variables.status = s;
    conditions.push("status: $status");
  }

  if (params.format) {
    const formatMap: Record<string, string> = {
      tv: "TV",
      movie: "MOVIE",
      film: "MOVIE",
      ova: "OVA",
      ona: "ONA",
      special: "SPECIAL",
      manga: "MANGA",
      novel: "NOVEL",
      novels: "NOVEL",
      one_shot: "ONE_SHOT",
    };
    const f = formatMap[params.format.toLowerCase()] || params.format.toUpperCase();
    variables.format = f;
    conditions.push("format: $format");
  }

  // Sort logic
  let sortVariable = "POPULARITY_DESC";
  if (params.query && params.query.trim().length > 0 && !params.sort) {
    sortVariable = "SEARCH_MATCH";
  } else if (params.sort === "trending") {
    sortVariable = "TRENDING_DESC";
  } else if (params.sort === "score") {
    sortVariable = "SCORE_DESC";
  } else if (params.sort === "newest") {
    sortVariable = "START_DATE_DESC";
  } else if (params.sort === "title") {
    sortVariable = "TITLE_ROMAJI";
  } else if (params.sort === "popular") {
    sortVariable = "POPULARITY_DESC";
  }

  variables.sort = [sortVariable];
  conditions.push("sort: $sort");

  const query = `
    query (
      $page: Int,
      $perPage: Int,
      $type: MediaType,
      ${variables.search ? "$search: String," : ""}
      ${variables.genre_in ? "$genre_in: [String]," : ""}
      ${variables.season ? "$season: MediaSeason," : ""}
      ${variables.seasonYear ? "$seasonYear: Int," : ""}
      ${variables.status ? "$status: MediaStatus," : ""}
      ${variables.format ? "$format: MediaFormat," : ""}
      $sort: [MediaSort]
    ) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          hasNextPage
          lastPage
        }
        media(${conditions.join(", ")}) {
          id
          idMal
          type
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          format
          status
          description
          seasonYear
          startDate { year month day }
          episodes
          chapters
          volumes
          duration
          averageScore
          popularity
          genres
          studios(isMain: true) { nodes { name } }
          staff(perPage: 3) { edges { role node { name { full } } } }
        }
      }
    }
  `;

  interface SearchResponse {
    Page: {
      pageInfo: { total: number; hasNextPage: boolean; lastPage: number };
      media: AniListMediaNode[];
    };
  }

  const result = await executeAniListQuery<SearchResponse>(query, variables);
  const mediaList = result.Page.media || [];
  const normalized = mediaList.map((m) => normalizeAniListItem(m, params.type));

  return {
    data: normalized,
    pagination: {
      total: result.Page.pageInfo.total,
      last_visible_page: result.Page.pageInfo.lastPage || 1,
      has_next_page: Boolean(result.Page.pageInfo.hasNextPage),
    },
  };
}

// ─── Top Media ───

export async function aniListTop(
  type: MediaType,
  filter?: string,
  page: number = 1,
  limit: number = 12
): Promise<OkamiMedia[]> {
  let sort = "SCORE_DESC";
  if (filter === "airing") sort = "POPULARITY_DESC";
  if (filter === "upcoming") sort = "POPULARITY_DESC";
  if (filter === "bypopularity") sort = "POPULARITY_DESC";
  if (filter === "favorite") sort = "FAVOURITES_DESC";

  const searchParams: AniListSearchParams = {
    type,
    page,
    limit,
    sort: sort === "SCORE_DESC" ? "score" : "popular",
  };

  if (filter === "airing") searchParams.status = "RELEASING";
  if (filter === "upcoming") searchParams.status = "NOT_YET_RELEASED";
  if (filter === "movie") searchParams.format = "MOVIE";
  if (filter === "novels") searchParams.format = "NOVEL";

  const res = await aniListSearch(searchParams);
  return res.data;
}

// ─── Seasonal Airing Media ───

export async function aniListSeason(
  year?: number,
  season?: string,
  page: number = 1,
  limit: number = 15
): Promise<OkamiMedia[]> {
  const currentYear = year || new Date().getFullYear();
  let currentSeason = (season || "").toUpperCase();

  if (!["WINTER", "SPRING", "SUMMER", "FALL"].includes(currentSeason)) {
    const month = new Date().getMonth() + 1;
    if (month >= 1 && month <= 3) currentSeason = "WINTER";
    else if (month >= 4 && month <= 6) currentSeason = "SPRING";
    else if (month >= 7 && month <= 9) currentSeason = "SUMMER";
    else currentSeason = "FALL";
  }

  const res = await aniListSearch({
    type: "anime",
    season: currentSeason,
    seasonYear: currentYear,
    sort: "popular",
    page,
    limit,
  });

  return res.data;
}

// ─── Full Media Detail & Franchise Graph ───

export async function aniListDetail(type: MediaType, idOrMalId: number): Promise<OkamiMedia> {
  const isAnime = type === "anime";
  const query = `
    query ($id: Int, $type: MediaType) {
      Media(idMal: $id, type: $type) {
        id
        idMal
        type
        title { romaji english native }
        coverImage { extraLarge large medium }
        bannerImage
        format
        status
        description
        seasonYear
        startDate { year month day }
        episodes
        chapters
        volumes
        duration
        averageScore
        popularity
        genres
        trailer { id site }
        studios(isMain: true) { nodes { name } }
        staff(perPage: 6) { edges { role node { name { full } } } }
      }
    }
  `;

  interface DetailResponse {
    Media?: AniListMediaNode | null;
  }

  try {
    const res = await executeAniListQuery<DetailResponse>(query, {
      id: idOrMalId,
      type: isAnime ? "ANIME" : "MANGA",
    });
    if (res.Media) return normalizeAniListItem(res.Media, type);
  } catch {
    // Try querying by AniList id directly if idMal query missed
    const fallbackQuery = `
      query ($id: Int, $type: MediaType) {
        Media(id: $id, type: $type) {
          id
          idMal
          type
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          format
          status
          description
          seasonYear
          startDate { year month day }
          episodes
          chapters
          volumes
          duration
          averageScore
          popularity
          genres
          trailer { id site }
          studios(isMain: true) { nodes { name } }
          staff(perPage: 6) { edges { role node { name { full } } } }
        }
      }
    `;
    const fallbackRes = await executeAniListQuery<DetailResponse>(fallbackQuery, {
      id: idOrMalId,
      type: isAnime ? "ANIME" : "MANGA",
    });
    if (fallbackRes.Media) return normalizeAniListItem(fallbackRes.Media, type);
  }

  throw new Error(`Media not found on AniList: ${type}/${idOrMalId}`);
}

export async function aniListFranchise(type: MediaType, idOrMalId: number): Promise<FranchiseGraph> {
  const query = `
    query ($id: Int, $type: MediaType) {
      Media(idMal: $id, type: $type) {
        id
        idMal
        type
        title { romaji english native }
        coverImage { extraLarge large }
        bannerImage
        format
        status
        seasonYear
        episodes
        chapters
        volumes
        averageScore
        relations {
          edges {
            relationType
            node {
              id
              idMal
              type
              format
              title { romaji english }
              seasonYear
              episodes
              chapters
              volumes
              averageScore
              coverImage { large }
            }
          }
        }
      }
    }
  `;

  interface FranchiseQueryResponse {
    Media?: AniListMediaNode | null;
  }

  let rootNode: AniListMediaNode | null = null;
  try {
    const res = await executeAniListQuery<FranchiseQueryResponse>(query, {
      id: idOrMalId,
      type: type === "manga" ? "MANGA" : "ANIME",
    });
    rootNode = res.Media || null;
  } catch {
    const fallbackQuery = query.replace("idMal: $id", "id: $id");
    const res = await executeAniListQuery<FranchiseQueryResponse>(fallbackQuery, {
      id: idOrMalId,
      type: type === "manga" ? "MANGA" : "ANIME",
    });
    rootNode = res.Media || null;
  }

  if (!rootNode) {
    throw new Error(`Cannot resolve franchise for ID: ${idOrMalId}`);
  }

  const rootMalId = rootNode.idMal || rootNode.id;
  const franchiseId = `franchise_${rootMalId}`;
  const rootTitle = rootNode.title?.english || rootNode.title?.romaji || "Franchise";
  const rootCover = rootNode.coverImage?.extraLarge || rootNode.coverImage?.large || "";

  const seasons: FranchiseSeasonNode[] = [];
  const extras: FranchiseExtraNode[] = [];
  const adaptations: FranchiseAdaptationNode[] = [];

  // Add the root node itself
  if (rootNode.type === "ANIME") {
    seasons.push({
      malId: rootMalId,
      title: rootTitle,
      titleEnglish: rootNode.title?.english || null,
      type: rootNode.format || "TV",
      seasonNumber: 1,
      episodes: rootNode.episodes ?? null,
      airedFrom: rootNode.seasonYear ? `${rootNode.seasonYear}-01-01` : null,
      year: rootNode.seasonYear || 0,
      score: rootNode.averageScore ? Number((rootNode.averageScore / 10).toFixed(1)) : null,
      cover: rootCover,
    });
  } else {
    adaptations.push({
      malId: rootMalId,
      title: rootTitle,
      titleEnglish: rootNode.title?.english || null,
      type: rootNode.format || "Manga",
      chapters: rootNode.chapters ?? null,
      volumes: rootNode.volumes ?? null,
      publishedFrom: rootNode.seasonYear ? `${rootNode.seasonYear}-01-01` : null,
      year: rootNode.seasonYear || 0,
      score: rootNode.averageScore ? Number((rootNode.averageScore / 10).toFixed(1)) : null,
      cover: rootCover,
    });
  }

  const relations = rootNode.relations?.edges || [];
  for (const edge of relations) {
    const relNode = edge.node;
    if (!relNode) continue;
    const relMalId = relNode.idMal || relNode.id;
    const relTitle = relNode.title?.english || relNode.title?.romaji || "Related Entry";
    const relCover = relNode.coverImage?.large || rootCover;
    const relScore = relNode.averageScore ? Number((relNode.averageScore / 10).toFixed(1)) : null;

    if (edge.relationType === "ADAPTATION" && relNode.type === "MANGA") {
      adaptations.push({
        malId: relMalId,
        title: relTitle,
        titleEnglish: relNode.title?.english || null,
        type: relNode.format || "Manga",
        chapters: relNode.chapters ?? null,
        volumes: relNode.volumes ?? null,
        publishedFrom: relNode.seasonYear ? `${relNode.seasonYear}-01-01` : null,
        year: relNode.seasonYear || 0,
        score: relScore,
        cover: relCover,
      });
    } else if (
      edge.relationType === "SEQUEL" ||
      edge.relationType === "PREQUEL" ||
      edge.relationType === "PARENT"
    ) {
      if (relNode.type === "ANIME" && (relNode.format === "TV" || relNode.format === "ONA")) {
        seasons.push({
          malId: relMalId,
          title: relTitle,
          titleEnglish: relNode.title?.english || null,
          type: relNode.format,
          seasonNumber: seasons.length + 1,
          episodes: relNode.episodes ?? null,
          airedFrom: relNode.seasonYear ? `${relNode.seasonYear}-01-01` : null,
          year: relNode.seasonYear || 0,
          score: relScore,
          cover: relCover,
        });
      } else {
        extras.push({
          malId: relMalId,
          title: relTitle,
          titleEnglish: relNode.title?.english || null,
          type: relNode.format || "Special",
          episodes: relNode.episodes ?? null,
          airedFrom: relNode.seasonYear ? `${relNode.seasonYear}-01-01` : null,
          year: relNode.seasonYear || 0,
          score: relScore,
          cover: relCover,
        });
      }
    } else {
      extras.push({
        malId: relMalId,
        title: relTitle,
        titleEnglish: relNode.title?.english || null,
        type: relNode.format || "Side Story",
        episodes: relNode.episodes ?? null,
        airedFrom: relNode.seasonYear ? `${relNode.seasonYear}-01-01` : null,
        year: relNode.seasonYear || 0,
        score: relScore,
        cover: relCover,
      });
    }
  }

  // Deduplicate and sort seasons chronologically
  const uniqueSeasons = Array.from(new Map(seasons.map((s) => [s.malId, s])).values()).sort(
    (a, b) => (a.year || 0) - (b.year || 0)
  );
  uniqueSeasons.forEach((s, idx) => {
    s.seasonNumber = idx + 1;
  });

  const uniqueExtras = Array.from(new Map(extras.map((e) => [e.malId, e])).values());
  const uniqueAdaptations = Array.from(new Map(adaptations.map((a) => [a.malId, a])).values());

  return {
    franchiseId,
    rootMalId,
    title: rootTitle,
    titleEnglish: rootNode.title?.english || null,
    cover: rootCover,
    bannerImage: rootNode.bannerImage || null,
    seasons: uniqueSeasons,
    extras: uniqueExtras,
    adaptations: uniqueAdaptations,
  };
}

export async function aniListCharacters(type: MediaType, idOrMalId: number): Promise<JikanCharacter[]> {
  const query = `
    query ($id: Int, $type: MediaType) {
      Media(idMal: $id, type: $type) {
        characters(page: 1, perPage: 25, sort: [ROLE, RELEVANCE]) {
          edges {
            role
            node {
              id
              name { full }
              image { large medium }
            }
            voiceActors(language: JAPANESE) {
              id
              name { full }
              image { large medium }
            }
          }
        }
      }
    }
  `;

  interface CharResponse {
    Media?: {
      characters?: {
        edges?: Array<{
          role?: string;
          node?: { id: number; name?: { full?: string }; image?: { large?: string } };
          voiceActors?: Array<{ id: number; name?: { full?: string }; image?: { large?: string } }>;
        }>;
      };
    } | null;
  }

  let data: CharResponse | null = null;
  try {
    data = await executeAniListQuery<CharResponse>(query, {
      id: idOrMalId,
      type: type === "manga" ? "MANGA" : "ANIME",
    });
  } catch {
    const fallbackQuery = query.replace("idMal: $id", "id: $id");
    data = await executeAniListQuery<CharResponse>(fallbackQuery, {
      id: idOrMalId,
      type: type === "manga" ? "MANGA" : "ANIME",
    });
  }

  const edges = data?.Media?.characters?.edges || [];
  return edges.map((edge) => ({
    id: edge.node?.id || 0,
    name: edge.node?.name?.full || "Unknown",
    role: edge.role === "MAIN" ? "Main" : "Supporting",
    image: edge.node?.image?.large || "",
    voiceActors: (edge.voiceActors || []).map((va) => ({
      id: va.id,
      name: va.name?.full || "",
      language: "Japanese",
      image: va.image?.large || "",
    })),
  }));
}
