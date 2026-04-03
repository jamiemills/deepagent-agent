import { fetchObservationSchema, searchObservationSchema } from "./schemas.js";
import type { FetchObservation, SearchObservation } from "./types.js";

export class SourceTracker {
  private readonly searchObservations: SearchObservation[] = [];
  private readonly fetchObservations: FetchObservation[] = [];

  recordSearch(observation: SearchObservation): void {
    this.searchObservations.push(searchObservationSchema.parse(observation));
  }

  recordFetch(observation: FetchObservation): void {
    this.fetchObservations.push(fetchObservationSchema.parse(observation));
  }

  getSearchObservations(): SearchObservation[] {
    return [...this.searchObservations];
  }

  getFetchObservations(): FetchObservation[] {
    return [...this.fetchObservations];
  }
}
