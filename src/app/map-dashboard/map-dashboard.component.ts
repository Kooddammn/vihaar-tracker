import { AsyncPipe, DatePipe, NgClass, NgFor, NgIf, isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, PLATFORM_ID, ViewChild, computed, inject, signal } from '@angular/core';
import { VihaarTrack, VihaarStatus } from '../data/vihaar-track';
import { VihaarTracksService } from '../data/vihaar-tracks.service';

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
export class MapDashboardComponent implements AfterViewInit, OnDestroy {
  private readonly tracksService = inject(VihaarTracksService);
  private readonly platformId = inject(PLATFORM_ID);
  readonly tracks$ = this.tracksService.tracks$;
  readonly santNameFilter = signal('');
  readonly statusFilter = signal<VihaarStatus | ''>('');
  readonly activeTrackId = signal<string | null>(null);
  readonly zoom = signal(5);
  readonly center = signal<MapPoint>({ latitude: 20.5937, longitude: 78.9629 });
  readonly mapWidth = signal(0);
  readonly mapHeight = signal(0);
  readonly isDragging = signal(false);
  readonly tiles = computed(() => this.visibleTiles());

  @ViewChild('mapCanvas') private mapCanvas?: ElementRef<HTMLDivElement>;

  private resizeObserver?: ResizeObserver;
  private dragStart?: { clientX: number; clientY: number; centerX: number; centerY: number };

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId) || !this.mapCanvas) return;
    this.resizeObserver = new ResizeObserver(() => {
      const bounds = this.mapCanvas?.nativeElement.getBoundingClientRect();
      if (bounds) {
        this.mapWidth.set(bounds.width);
        this.mapHeight.set(bounds.height);
      }
    });
    this.resizeObserver.observe(this.mapCanvas.nativeElement);
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
    this.zoom.update((level) => Math.max(level - 1, 3));
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
    this.center.set({
      latitude: Math.max(-85.05112878, Math.min(85.05112878, latitude)),
      longitude: this.wrapLongitude(longitude),
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



