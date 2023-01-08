export enum QueryType {
  SPOTIFY_LINK,
  YOUTUBE_LINK,
  DIRECT_QUERY,
}

export interface Query {
  query: string,
  sourceLink?: string,
  type: QueryType,
}
