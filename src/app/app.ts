import { Component, signal } from '@angular/core';
import { MapDashboardComponent } from './map-dashboard/map-dashboard.component';
import { VolunteerCheckinComponent } from './volunteer-checkin/volunteer-checkin.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MapDashboardComponent, VolunteerCheckinComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly activeView = signal<'map' | 'checkin'>('map');
}
