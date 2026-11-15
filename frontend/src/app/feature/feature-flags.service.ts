import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';

import { environment } from '../../environments/environment';

/** Unreleased features that are on (decision record 0002); GET /api/features. */
export interface Features {
  dragDrop: boolean;
}

const ALL_OFF: Features = { dragDrop: false };

/**
 * Loads the feature flags once when the app starts. Everything is off until they arrive, and stays
 * off if the request fails, so an unreleased control never shows by mistake. The app doesn't wait
 * for them: the free Render instance can take a minute to wake up.
 */
@Injectable({ providedIn: 'root' })
export class FeatureFlagsService {
  private readonly http = inject(HttpClient);
  private readonly features = signal<Features>(ALL_OFF);

  /** Moving a day to another day (BILLIAMVT-27, 28). */
  readonly dragDrop = () => this.features().dragDrop;

  load(): void {
    this.http.get<Features>(`${environment.apiUrl}/api/features`).subscribe({
      next: (features) => this.features.set({ ...ALL_OFF, ...features }),
      error: () => this.features.set(ALL_OFF),
    });
  }
}
