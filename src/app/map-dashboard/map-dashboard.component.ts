import { AsyncPipe, DatePipe, NgClass, NgFor, NgIf, isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, OnDestroy, PLATFORM_ID, ViewChild, computed, inject, signal } from '@angular/core';
import { VihaarTrack, VihaarStatus } from '../data/vihaar-track';
import { INDIA_BOUNDARY } from './india-boundary';
import { VihaarTracksService } from '../data/vihaar-tracks.service';
import { catchError, of, startWith } from 'rxjs';

interface MapPoint {
  latitude: number;
  longitude: number;
}

interface MapTile {
  key: string;
  url: string;
  left: number;
  top: number;
}


@Component({
  selector: 'app-map-dashboard',
  standalone: true,
  imports: [AsyncPipe, DatePipe, NgClass, NgFor, NgIf],
  templateUrl: './map-dashboard.component.html',
  styleUrl: './map-dashboard.component.css',
})
export class MapDashboardComponent implements OnDestroy {
  private readonly tracksService = inject(VihaarTracksService);
  private readonly platformId = inject(PLATFORM_ID);
  readonly tracks$ = this.tracksService.tracks$.pipe(
    startWith([] as VihaarTrack[]),
    catchError((error: unknown) => {
      console.error('Unable to load vihaar map updates:', error);
      return of([] as VihaarTrack[]);
    }),
  );
  readonly santNameFilter = signal('');
  readonly statusFilter = signal<VihaarStatus | ''>('');
  readonly activeTrackId = signal<string | null>(null);
  readonly selectedTimelineSant = signal<string | null>(null);
  readonly zoom = signal(5);
  readonly center = signal<MapPoint>({ latitude: 22.5, longitude: 79 });
  readonly mapWidth = signal(0);
  readonly mapHeight = signal(0);
  readonly isDragging = signal(false);
  readonly tiles = computed(() => this.visibleTiles());

  private resizeObserver?: ResizeObserver;
  private dragStart?: { clientX: number; clientY: number; centerX: number; centerY: number };

  @ViewChild('mapCanvas')
  set mapCanvas(element: ElementRef<HTMLDivElement> | undefined) {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;

    if (!element || !isPlatformBrowser(this.platformId)) return;

    const updateMapSize = (): void => {
      const bounds = element.nativeElement.getBoundingClientRect();
      this.mapWidth.set(bounds.width);
      this.mapHeight.set(bounds.height);
    };

    this.resizeObserver = new ResizeObserver(updateMapSize);
    this.resizeObserver.observe(element.nativeElement);
    updateMapSize();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  zoomIn(event: MouseEvent): void {
    event.stopPropagation();
    this.zoom.update((level) => Math.min(level + 1, 19));
  }

  zoomOut(event: MouseEvent): void {
    event.stopPropagation();
    this.zoom.update((level) => Math.max(level - 1, 4));
  }

  startPan(event: PointerEvent): void {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, a, .track-marker')) return;
    const centerPoint = this.toWorldPoint(this.center(), this.zoom());
    this.dragStart = {
      clientX: event.clientX,
      clientY: event.clientY,
      centerX: centerPoint.x,
      centerY: centerPoint.y,
    };
    this.isDragging.set(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  pan(event: PointerEvent): void {
    if (!this.dragStart) return;
    const scale = 256 * 2 ** this.zoom();
    const longitude = ((this.dragStart.centerX - (event.clientX - this.dragStart.clientX)) / scale) * 360 - 180;
    const mercatorY = Math.PI - (2 * Math.PI * (this.dragStart.centerY - (event.clientY - this.dragStart.clientY))) / scale;
    const latitude = (180 / Math.PI) * Math.atan(Math.sinh(mercatorY));
    // Keep map navigation focused on mainland India.
    this.center.set({
      latitude: Math.max(7, Math.min(36.5, latitude)),
      longitude: Math.max(68, Math.min(97.5, this.wrapLongitude(longitude))),
    });
  }

  endPan(): void {
    this.dragStart = undefined;
    this.isDragging.set(false);
  }

  filteredTracks(tracks: VihaarTrack[]): VihaarTrack[] {
    const santQuery = this.santNameFilter().trim().toLocaleLowerCase();
    const selectedStatus = this.statusFilter();
    return tracks.filter((track) =>
      (!santQuery || track.santName.toLocaleLowerCase().includes(santQuery))
      && (!selectedStatus || track.status === selectedStatus),
    );
  }

  journeyTimeline(tracks: VihaarTrack[]): VihaarTrack[] {
    const santName = this.selectedTimelineSant()?.trim().toLocaleLowerCase();
    if (!santName) return [];
    return tracks
      .filter((track) => track.santName.trim().toLocaleLowerCase() === santName)
      .sort((a, b) => {
        const first = Date.parse(a.lastUpdatedAt);
        const second = Date.parse(b.lastUpdatedAt);
        return (Number.isFinite(first) ? first : 0) - (Number.isFinite(second) ? second : 0);
      });
  }

  showJourneyTimeline(track: VihaarTrack, event: MouseEvent): void {
    event.stopPropagation();
    this.selectedTimelineSant.set(track.santName);
    if (typeof document !== 'undefined') {
      setTimeout(() => {
        const timeline = document.getElementById('journey-timeline');
        timeline?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        timeline?.focus({ preventScroll: true });
      });
    }
  }

  closeJourneyTimeline(): void {
    this.selectedTimelineSant.set(null);
  }

  setSantNameFilter(event: Event): void {
    this.santNameFilter.set((event.target as HTMLInputElement).value);
    this.activeTrackId.set(null);
  }

  setStatusFilter(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as VihaarStatus | '');
    this.activeTrackId.set(null);
  }

  clearFilters(): void {
    this.santNameFilter.set('');
    this.statusFilter.set('');
    this.activeTrackId.set(null);
  }

  hasActiveFilters(): boolean {
    return Boolean(this.santNameFilter().trim() || this.statusFilter());
  }

  indiaBoundaryPath(): string {
    const centerPoint = this.toWorldPoint(this.center(), this.zoom());
    const commands = INDIA_BOUNDARY.map(([longitude, latitude], index) => {
      const point = this.toWorldPoint({ latitude, longitude }, this.zoom());
      const left = point.x - centerPoint.x + this.mapWidth() / 2;
      const top = point.y - centerPoint.y + this.mapHeight() / 2;
      return (index === 0 ? 'M' : 'L') + ' ' + left.toFixed(2) + ' ' + top.toFixed(2);
    });
    return commands.join(' ') + ' Z';
  }

  indiaOutsideMaskPath(): string {
    return 'M 0 0 H ' + this.mapWidth() + ' V ' + this.mapHeight() + ' H 0 Z ' + this.indiaBoundaryPath();
  }
  markerPosition(track: VihaarTrack): { left: number; top: number } {
    const point = this.toWorldPoint(track.coordinates, this.zoom());
    const centerPoint = this.toWorldPoint(this.center(), this.zoom());
    return {
      left: point.x - centerPoint.x + this.mapWidth() / 2,
      top: point.y - centerPoint.y + this.mapHeight() / 2,
    };
  }

  trackKey(track: VihaarTrack): string {
    return track.id ?? `${track.santName}:${track.coordinates.latitude}:${track.coordinates.longitude}`;
  }

  toggleTrackDetails(track: VihaarTrack, event: MouseEvent): void {
    event.stopPropagation();
    const key = this.trackKey(track);
    this.activeTrackId.update((activeId) => (activeId === key ? null : key));
  }
  markerClass(status: VihaarStatus): string {
    if (status === 'Walking') return 'walking';
    if (status === 'Resting') return 'resting';
    return 'other';
  }

  markerTitle(track: VihaarTrack): string {
    return `${track.santName} · ${track.status} · Current halt: ${track.currentLocationName} · Next destination: ${track.nextDestinationName || 'Not specified'} · Shared by ${track.volunteerName}`;
  }

  private visibleTiles(): MapTile[] {
    const width = this.mapWidth();
    const height = this.mapHeight();
    if (!width || !height) return [];

    const level = this.zoom();
    const worldSize = 256 * 2 ** level;
    const center = this.toWorldPoint(this.center(), level);
    const leftEdge = center.x - width / 2;
    const topEdge = center.y - height / 2;
    const firstColumn = Math.floor(leftEdge / 256);
    const lastColumn = Math.floor((leftEdge + width) / 256);
    const firstRow = Math.floor(topEdge / 256);
    const lastRow = Math.floor((topEdge + height) / 256);
    const tileCount = 2 ** level;
    const tiles: MapTile[] = [];

    for (let row = firstRow; row <= lastRow; row += 1) {
      if (row < 0 || row >= tileCount) continue;
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const wrappedColumn = ((column % tileCount) + tileCount) % tileCount;
        tiles.push({
          key: `${level}/${wrappedColumn}/${row}/${column}`,
          url: `https://tile.openstreetmap.org/${level}/${wrappedColumn}/${row}.png`,
          left: column * 256 - leftEdge,
          top: row * 256 - topEdge,
        });
      }
    }

    return tiles;
  }

  private toWorldPoint(point: MapPoint, zoom: number): { x: number; y: number } {
    const latitude = Math.max(-85.05112878, Math.min(85.05112878, point.latitude));
    const scale = 256 * 2 ** zoom;
    const sinLatitude = Math.sin((latitude * Math.PI) / 180);
    return {
      x: ((point.longitude + 180) / 360) * scale,
      y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale,
    };
  }

  private wrapLongitude(longitude: number): number {
    return ((((longitude + 180) % 360) + 360) % 360) - 180;
  }
}



