import * as Location from 'expo-location';

export interface Coords {
  latitude: number;
  longitude: number;
}

/** Solicita permissão de localização em foreground. Retorna false sem throw. */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Obtém a localização atual (best-effort). Em timeout (10s) ou erro, retorna null —
 * localização nunca deve bloquear o acionamento do pânico.
 */
export async function getCurrentLocation(): Promise<Coords | null> {
  try {
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 10000),
    );
    const position = Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }).then((pos) => ({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    }));

    return await Promise.race([position, timeout]);
  } catch {
    return null;
  }
}
