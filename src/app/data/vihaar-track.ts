export type VihaarStatus = 'Walking' | 'Resting' | 'Pravachan' | 'Completed';

export interface VihaarCoordinates {
  latitude: number;
  longitude: number;
}

export interface VihaarTrack {
  id?: string;
  santName: string;
  status: VihaarStatus;
  currentLocationName: string;
  nextDestinationName: string;
  volunteerName: string;
  lastUpdatedAt: string;
  coordinates: VihaarCoordinates;
}
