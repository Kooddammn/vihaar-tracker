import { Component, inject, signal } from '@angular/core';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { VihaarStatus } from '../data/vihaar-track';
import { VihaarTracksService } from '../data/vihaar-tracks.service';

@Component({
  selector: 'app-volunteer-checkin',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './volunteer-checkin.component.html',
  styleUrl: './volunteer-checkin.component.css',
})
export class VolunteerCheckinComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tracksService = inject(VihaarTracksService);

  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly locationMessage = signal('');
  readonly santNames = signal<string[]>([]);
  readonly santNameDraft = signal('');
  readonly santNameDraftError = signal('');

  readonly form = this.formBuilder.group({
    santName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    status: ['', Validators.required],
    currentLocationName: ['', Validators.required],
    nextDestinationName: [''],
    volunteerName: ['', Validators.required],
    mobileNumber: ['', [Validators.required, Validators.pattern(/^(?:\+[1-9][0-9\s()-]{6,20}|[6-9]\d{9})$/)]],
    latitude: new FormControl<number | null>(null, [Validators.required, Validators.min(-90), Validators.max(90)]),
    longitude: new FormControl<number | null>(null, [Validators.required, Validators.min(-180), Validators.max(180)]),
  });

  updateSantNameDraft(event: Event): void {
    this.santNameDraft.set((event.target as HTMLInputElement).value);
    this.santNameDraftError.set('');
  }

  addSantNameFromKeyboard(event: KeyboardEvent): void {
    event.preventDefault();
    this.addSantName();
  }

  addSantName(): void {
    const name = this.santNameDraft().trim().replace(/\s+/g, ' ');
    if (!name) {
      this.santNameDraftError.set('Enter a Sant name first.');
      return;
    }
    if (name.length < 3) {
      this.santNameDraftError.set('Each Sant name must be at least 3 characters.');
      return;
    }
    if (name.includes(',')) {
      this.santNameDraftError.set('Add one Sant at a time; commas are used to separate the group.');
      return;
    }
    if (this.santNames().some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      this.santNameDraftError.set('That Sant is already in this group.');
      return;
    }

    const nextNames = [...this.santNames(), name];
    const groupName = nextNames.join(', ');
    if (groupName.length > 120) {
      this.santNameDraftError.set('The group name must fit within 120 characters.');
      return;
    }
    this.santNames.set(nextNames);
    this.form.controls.santName.setValue(groupName);
    this.form.controls.santName.markAsTouched();
    this.santNameDraft.set('');
    this.santNameDraftError.set('');
  }

  removeSantName(nameToRemove: string): void {
    const nextNames = this.santNames().filter((name) => name !== nameToRemove);
    this.santNames.set(nextNames);
    this.form.controls.santName.setValue(nextNames.join(', '));
    this.form.controls.santName.markAsTouched();
  }

  useCurrentLocation(): void {
    this.locationMessage.set('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.locationMessage.set('Location access is not available in this browser.');
      return;
    }
    this.locationMessage.set('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.form.patchValue({ latitude: Number(coords.latitude.toFixed(6)), longitude: Number(coords.longitude.toFixed(6)) });
        this.form.controls.latitude.markAsDirty();
        this.form.controls.longitude.markAsDirty();
        this.locationMessage.set('Location captured. Please verify the pin before sharing.');
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied. You can enter coordinates manually.'
          : error.code === error.TIMEOUT
            ? 'Location lookup timed out. Try again or enter coordinates manually.'
            : 'Could not determine your location. Check your device settings and try again.';
        this.locationMessage.set(message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');
    if (this.santNameDraft().trim()) {
      this.addSantName();
      if (this.santNameDraft().trim()) return;
    }
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.saving.set(true);
    try {
      await this.tracksService.addTrack({
        santName: value.santName.trim(),
        status: value.status as VihaarStatus,
        currentLocationName: value.currentLocationName.trim(),
        nextDestinationName: value.nextDestinationName.trim(),
        volunteerName: value.volunteerName.trim(),
        lastUpdatedAt: new Date().toISOString(),
        coordinates: { latitude: value.latitude!, longitude: value.longitude! },
      });
      this.form.reset({
        santName: '', status: '', currentLocationName: '', nextDestinationName: '',
        volunteerName: '', mobileNumber: '', latitude: null, longitude: null,
      });
      this.submitted.set(false);
      this.santNames.set([]);
      this.santNameDraft.set('');
      this.santNameDraftError.set('');
      this.locationMessage.set('');
      this.successMessage.set('Thank you. The journey update has been shared.');
      setTimeout(() => this.successMessage.set(''), 5000);
    } catch (error) {
      console.error('Unable to save vihaar update:', error);
      this.errorMessage.set(this.isPermissionDenied(error)
        ? 'Your update could not be saved because this browser is not signed in as an authorized volunteer.'
        : 'Your update could not be sent. Check your connection and try again.');
    } finally {
      this.saving.set(false);
    }
  }

  showError(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || this.submitted());
  }

  private isPermissionDenied(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error
      && String(error.code) === 'permission-denied';
  }
}
