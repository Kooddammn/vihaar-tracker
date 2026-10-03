import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import { Firestore, addDoc, collection, onSnapshot } from '@angular/fire/firestore';
import { Observable, shareReplay } from 'rxjs';
import { VihaarTrack } from './vihaar-track';

@Injectable({ providedIn: 'root' })
export class VihaarTracksService {
  private readonly injector = inject(Injector);
  private readonly firestore = inject(Firestore);
  private readonly tracksCollection = collection(this.firestore, 'vihaar_tracks');

  readonly tracks$ = new Observable<VihaarTrack[]>((subscriber) =>
    runInInjectionContext(this.injector, () =>
      onSnapshot(
        this.tracksCollection,
        (snapshot) => {
          const tracks = snapshot.docs.map((document) => ({
            ...document.data(),
            id: document.id,
          })) as VihaarTrack[];
          subscriber.next(tracks);
        },
        (error) => subscriber.error(error),
      ),
    ),
  ).pipe(shareReplay({ bufferSize: 1, refCount: true }));

  addTrack(track: Omit<VihaarTrack, 'id'>): Promise<void> {
    return runInInjectionContext(this.injector, () => addDoc(this.tracksCollection, track)).then(() => undefined);
  }
}